'use strict';
// PDF chek (kvitansiya): o'zbekcha / ruscha, chap tomonda ma'lumot, o'ngda jadval, "To'landi" muhri.
// QR: chek ma'lumoti + HMAC kod (QR_SECRET). Botda /tekshir bilan haqiqiyligi tekshiriladi.
// Sozlamalar (.env): QR_SECRET, ORG_NAME, ORG_SITE (standart avtomentor.uz), ORG_ACCOUNT (ixtiyoriy), ORG_PHONE (ixtiyoriy)
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const F = require('./finance');

const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
const pad = (n) => String(n).padStart(2, '0');
const money = (n) => new Intl.NumberFormat('ru-RU').format(n).replace(/[\u00a0\u202f]/g, ' ') + '.00';
const dateOnly = (x) => { const d = new Date(x); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
const stamp = (x) => {
  const d = new Date(x);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Chek kodi: bazadagi qiymatlardan hisoblanadi, shuning uchun QR dagi summani o'zgartirib bo'lmaydi
const receiptSig = (p) =>
  crypto.createHmac('sha256', process.env.QR_SECRET || process.env.BOT_TOKEN || 'dev-secret')
    .update(`${p.id}|${p.studentId}|${p.amount}`).digest('hex').slice(0, 10);

function qrPayload(p) {
  const d = new Date(p.paidAt);
  return [
    `Chek №${p.id}`,
    process.env.ORG_NAME || 'Avtotest markazi',
    `O'quvchi #${p.studentId}`,
    `Summa ${p.amount}`,
    `Sana ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    `Kod: ${receiptSig(p)}`,
  ].join('\n');
}

// QR ni vektor ko'rinishida chizish (aniq chiqadi)
function drawQr(doc, text, x, y, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const c = size / n;
  doc.fillColor('#000');
  for (let r = 0; r < n; r++) {
    for (let q = 0; q < n; q++) {
      if (qr.modules.get(r, q)) doc.rect(x + q * c, y + r * c, c + 0.25, c + 0.25).fill();
    }
  }
}

// student: Student, payment: Payment, calc: F.calc natijasi (shu to'lovdan keyingi holat)
function buildReceiptPdf({ student, payment, calc }) {
  return new Promise((resolve, reject) => {
    const org = {
      name: process.env.ORG_NAME || 'Avtotest markazi',
      site: process.env.ORG_SITE === undefined ? 'avtomentor.uz' : process.env.ORG_SITE,
      account: process.env.ORG_ACCOUNT || '',
      phone: process.env.ORG_PHONE || '',
    };
    const cancelled = payment.status === 'CANCELLED';
    const doc = new PDFDocument({ size: [520, 420], margin: 0, info: { Title: `Chek №${payment.id}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('R', path.join(FONTS, 'DejaVuSans.ttf'));
    doc.registerFont('B', path.join(FONTS, 'DejaVuSans-Bold.ttf'));

    const x0 = 20; const y0 = 20; const bw = 480; const lw = 170;
    const rx = x0 + lw; const rw = bw - lw; const lc = 100; const vc = rw - lc;
    doc.lineWidth(1.2).strokeColor('#000');

    const rows = [
      ['Oluvchi /', 'Получатель', org.site ? `${org.name}\n${org.site}` : org.name],
      ...(org.account ? [['Hisobraqam /', 'Р/с', org.account]] : []),
      ["O'quvchi /", 'Ученик', `${student.fullName} (#${student.id})`],
      ['Toifa /', 'Категория', student.category],
      ["O'qish tugashi /", 'Окончание обучения', student.endDate ? dateOnly(student.endDate) : 'Boshlanish sanasi hali belgilanmagan / Дата начала не назначена'],
      ["To'lov maqsadi /", 'Назначение платежа', `O'qish uchun to'lov / Оплата за обучение${payment.note ? ` (${payment.note})` : ''}`],
      ...(cancelled ? [['Bekor sababi /', 'Причина отмены', payment.cancelReason || '—', true]] : []),
    ];

    let y = y0;
    for (const [uz, ru, val, red] of rows) {
      doc.font('B').fontSize(8.5);
      const hl = doc.heightOfString(`${uz}\n${ru}`, { width: lc - 12 });
      doc.font('R').fontSize(9);
      const hv = doc.heightOfString(String(val), { width: vc - 14 });
      const h = Math.max(hl, hv) + 12;
      doc.rect(rx, y, lc, h).stroke();
      doc.rect(rx + lc, y, vc, h).stroke();
      doc.fillColor('#000').font('B').fontSize(8.5).text(`${uz}\n${ru}`, rx + 6, y + 6, { width: lc - 12 });
      doc.fillColor(red ? '#c00' : '#000').font('R').fontSize(9).text(String(val), rx + lc + 7, y + 6, { width: vc - 14 });
      y += h;
    }

    // Summa qatori (chap ustun balandligi yetarli bo'lishi uchun minimal balandlik)
    const amountH = Math.max(46, 215 - (y - y0));
    doc.rect(rx, y, lc, amountH).stroke();
    doc.rect(rx + lc, y, vc, amountH).stroke();
    doc.fillColor('#000').font('B').fontSize(8.5).text('Miqdor /\nСумма', rx + 6, y + 8, { width: lc - 12 });
    doc.fillColor(cancelled ? '#c00' : '#000').font('B').fontSize(17)
      .text(`${money(payment.amount)} so'm`, rx + lc + 7, y + 10, { width: vc - 14 });
    if (cancelled) doc.font('B').fontSize(8).text('BEKOR QILINGAN / ОТМЕНЁН', rx + lc + 7, y + 34, { width: vc - 14 });
    const yTable = y + amountH;

    // Chap ustun
    doc.rect(x0, y0, lw, yTable - y0).stroke();
    doc.fillColor('#000').font('B').fontSize(10).text('KVITANSIYA / КВИТАНЦИЯ', x0 + 6, y0 + 8, { width: lw - 12, align: 'center' });
    let ly = y0 + 34;
    const pair = (uz, ru, val) => {
      doc.font('R').fontSize(7.5).fillColor('#444').text(`${uz} / ${ru}`, x0 + 8, ly, { width: lw - 16 });
      ly = doc.y;
      doc.font('B').fontSize(9).fillColor('#000').text(val, x0 + 8, ly + 1, { width: lw - 16 });
      ly = doc.y + 7;
    };
    pair('Chek raqami', 'Номер чека', `№${payment.id}`);
    pair('Sana va vaqti', 'Дата и время', stamp(payment.paidAt));
    pair("Jami to'langan", 'Всего оплачено', `${money(calc.paid)} / ${money(calc.net)}`);
    pair('Qolgan qarz', 'Остаток долга', money(calc.debt));

    // Muhr
    const sx = x0 + 12; const sw = lw - 24; const sh = 38; const sy = yTable - sh - 10;
    const color = cancelled ? '#c00' : '#1a56db';
    doc.roundedRect(sx, sy, sw, sh, 8).lineWidth(1.5).strokeColor(color).stroke();
    doc.fillColor(color).font('B').fontSize(cancelled ? 11 : 13)
      .text(cancelled ? 'BEKOR' : "To'landi", sx, sy + 6, { width: sw, align: 'center' });
    doc.font('R').fontSize(8).text(cancelled ? 'ОТМЕНЕНО' : 'Оплачено', sx, sy + 24, { width: sw, align: 'center' });

    // Pastki blok: QR + tekshirish ko'rsatmasi
    const fh = 96;
    doc.lineWidth(1.2).strokeColor('#000').rect(x0, yTable, bw, fh).stroke();
    drawQr(doc, qrPayload(payment), x0 + 12, yTable + 12, 72);
    const tx = x0 + 100; const tw = bw - 112;
    doc.fillColor('#000').font('B').fontSize(8.5).text('Chekni tekshirish / Проверка чека', tx, yTable + 14, { width: tw });
    doc.font('R').fontSize(7.5).fillColor('#333')
      .text("QR kodni skanerlang va matnni botga yuboring (/tekshir).\nОтсканируйте QR-код и отправьте текст боту (/tekshir).", tx, doc.y + 3, { width: tw });
    doc.fillColor('#555').fontSize(7)
      .text(`${org.phone ? org.phone + '  |  ' : ''}Chek avtomatik shakllantirilgan / Чек сформирован автоматически`, tx, yTable + fh - 20, { width: tw });

    doc.end();
  });
}

// Chekni Telegramga PDF qilib yuboradi (xato bo'lsa matn bilan)
async function sendReceipt(ctx, student, payment, calc, caption) {
  const U = require('./util');
  try {
    const source = await buildReceiptPdf({ student, payment, calc });
    return await ctx.replyWithDocument({ source, filename: `chek-${payment.id}.pdf` }, { caption: caption || `Chek №${payment.id}` });
  } catch (e) {
    console.error('PDF chek xatosi:', e);
    return ctx.reply(U.receipt(student, payment, calc));
  }
}

// To'lovdan keyingi holat: shu chekkacha bo'lgan to'lovlar bo'yicha hisob
const calcAsOf = (student, payment) => F.calc(student, (student.payments || []).filter((p) => p.id <= payment.id));

module.exports = { buildReceiptPdf, sendReceipt, calcAsOf, receiptSig, qrPayload };
