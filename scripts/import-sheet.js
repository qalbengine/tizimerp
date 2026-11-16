// Eski Google Sheet'dan o'quvchilarni ko'chirish.
// 1) Sheet'da "B" (yoki "BC") varag'ini oching: File → Download → Comma Separated Values (.csv)
// 2) Faylni shu papkaga qo'ying (masalan b.csv)
// 3) Sinov:   node scripts/import-sheet.js b.csv --rows=108-122 --group=61-16
//    Yozish:  node scripts/import-sheet.js b.csv --rows=108-122 --group=61-16 --apply
// --rows  = Sheet'dagi qator raqamlari (chap tarafdagi 108, 122 ...). Berilmasa hammasi.
// --plan=scripts/groups.json = qator oralig'i -> guruh nomi va tashqi o'tkazma qoidasi; --update = bazada bor o'quvchining guruh/o'tkazmasini yangilaydi.
// --group = guruh nomi (yo'q bo'lsa ochiladi). --category=B yoki BC (varaqqa qarab).
require('dotenv').config();
const fs = require('fs');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const APPLY = args.includes('--apply');
const CATEGORY = opt('category', 'B');
const GROUP = opt('group', '');
const ROWS = opt('rows', '');
const PLAN_FILE = opt('plan', '');
const UPDATE = args.includes('--update');
const PLAN = PLAN_FILE ? JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8')) : null;
const groupOf = (n) => { if (!PLAN) return GROUP; const g = PLAN.groups.find((x) => n >= x.from && n <= x.to); return g ? g.name : ''; };
if (!file) { console.error('Fayl nomini bering: node scripts/import-sheet.js b.csv --rows=108-122 --group=61-16'); process.exit(1); }

const DEFAULT_TARIFF = {
  B: { total: 5500000, extStage1: 1000000, extStage2: 1000000, instructorShare: 500000 },
  BC: { total: 7200000, extStage1: 1000000, extStage2: 2500000, instructorShare: 1000000 },
  C: { total: 3500000, extStage1: 1000000, extStage2: 1000000, instructorShare: 500000 },
  E: { total: 3500000, extStage1: 1000000, extStage2: 1000000, instructorShare: 500000 },
};

// ---- CSV (qo'shtirnoq, vergul, qator ichidagi enter bilan) ----
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const norm = (s) => String(s || '').toLowerCase().replace(/[’ʻʼ`‘']/g, "'").replace(/\s+/g, ' ').trim();
const digits = (s) => parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;
function parsePhones(raw) {
  const nums = String(raw).split(/[\s,;\n]+/).map((x) => x.replace(/\D/g, '').slice(-9)).filter((x) => x.length >= 9);
  return nums.length ? { phone: nums[0], phone2: nums[1] || null } : { phone: String(raw).trim(), phone2: null };
}
function parseDate(s, h = 9, m = 0) {
  const x = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(s || ''));
  if (!x) return null;
  const p = (n) => String(n).padStart(2, '0');
  return new Date(`${x[3]}-${p(x[2])}-${p(x[1])}T${p(h)}:${p(m)}:00+05:00`);
}
// History: "19.06.2026 11:38|2500000,19.06.2026 ..." -> [{date, amount}]
function parseHistory(s) {
  const out = []; const re = /(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*\|\s*(\d+)/g; let m;
  while ((m = re.exec(String(s || '')))) out.push({ date: parseDate(m[1], +(m[2] || 9), +(m[3] || 0)), amount: +m[4] });
  return out;
}

async function main() {
  const F = require('../src/finance');
  const all = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = all[0].map(norm);
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const C = { name: col('ism'), phone: col('raqam'), price: col('narx'), paid: col("to'lov"), date: col('sana'),
    ext: col("o'tkazilgan"), hist: col('history') };
  // "To'lovi" va "Chek"/"To'lov cheki" aralashmasin: aniq "to'lovi"
  const exact = head.findIndex((h) => h === "to'lovi"); if (exact >= 0) C.paid = exact;
  for (const k of ['name', 'phone', 'price', 'paid', 'date']) {
    if (C[k] < 0) { console.error(`CSV da ustun topilmadi: ${k}. Sarlavhalar: ${all[0].join(' | ')}`); process.exit(1); }
  }
  let lo = 2, hi = all.length;
  const groupCache = {};
  async function getGroup(name) {
    if (!name || !prisma) return null;
    if (!groupCache[name]) groupCache[name] = await prisma.group.upsert({ where: { name }, update: {}, create: { name } });
    return groupCache[name];
  }
  if (ROWS) { const [a, b] = ROWS.split('-').map(Number); lo = a; hi = b || a; }

  let tariff = DEFAULT_TARIFF[CATEGORY];
  let prisma = null;
  if (APPLY) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    tariff = await prisma.tariff.findUnique({ where: { category: CATEGORY } });
    if (!tariff) throw new Error('Tarif topilmadi');
  }
  const actor = BigInt((process.env.ADMIN_IDS || '0').split(',')[0].trim() || 0);
  console.log(`Fayl: ${file} | qatorlar ${lo}-${hi} | kategoriya ${CATEGORY} | guruh ${PLAN ? PLAN_FILE : (GROUP || '—')} | ${APPLY ? 'YOZISH' : 'SINOV (yozilmaydi)'}\n`);

  let ok = 0, skip = 0, warn = 0;
  for (let n = lo; n <= hi; n++) {
    const r = all[n - 1];
    if (!r || !String(r[C.name] || '').trim()) continue;
    const fullName = String(r[C.name]).replace(/\s+/g, ' ').trim();
    const { phone, phone2 } = parsePhones(r[C.phone]);
    const price = digits(r[C.price]); const paid = digits(r[C.paid]);
    const registeredAt = parseDate(r[C.date]) || new Date();
    let ext = C.ext >= 0 ? digits(r[C.ext]) : 0;
    let pays = C.hist >= 0 ? parseHistory(r[C.hist]) : [];
    const sum = pays.reduce((a, p) => a + p.amount, 0);
    let note = '';
    if (pays.length === 0 || sum !== paid) {
      if (pays.length && sum < paid) {
        // History to'liq emas: bor to'lovlar o'z sanasi bilan, yetmagani ro'yxat sanasiga
        note = ` ⚠ history ${sum} < to'lovi ${paid}: ${paid - sum} ro'yxat sanasiga qo'shildi`; warn++;
        pays = [{ date: registeredAt, amount: paid - sum }, ...pays];
      } else {
        if (pays.length) { note = ` ⚠ history ${sum} > to'lovi ${paid}: bitta to'lov qilindi`; warn++; }
        pays = paid > 0 ? [{ date: registeredAt, amount: paid }] : [];
      }
    }
    const discount = Math.max(tariff.total - price, 0);
    const docApproved = paid > tariff.extStage1;
    const gname = groupOf(n);
    if (PLAN) {
      const p1 = Math.min(paid, tariff.extStage1); const p2 = Math.min(paid - p1, tariff.extStage2);
      ext = n <= PLAN.bothStagesToRow ? p1 + p2 : p1; // eski qatorlar: 2 bosqich, yangilari: faqat 1-bosqich
    }
    const line = `#${n} ${fullName.padEnd(26)} ${phone}${phone2 ? '/' + phone2 : ''} narx ${price} to'langan ${paid} (${pays.length} to'lov) chegirma ${discount} qarz ${Math.max(price - paid, 0)} sana ${registeredAt.toISOString().slice(0, 10)} guruh ${gname || '—'} o'tkazilgan ${ext}${note}`;
    if (!APPLY) { console.log('• ' + line); ok++; continue; }
    const dup = await prisma.student.findFirst({ where: { deletedAt: null, OR: [{ phone }, { phone2: phone }] } });
    if (dup && UPDATE) {
      const g = await getGroup(gname);
      await prisma.student.update({ where: { id: dup.id }, data: { groupId: g ? g.id : dup.groupId, externalTransferred: ext } });
      console.log(`↻ YANGILANDI: ${line}`); ok++; continue;
    }
    if (dup) { console.log(`— BOR, o'tkazildi: ${line}`); skip++; continue; }
    const group = await getGroup(gname);
    await prisma.$transaction(async (tx) => {
      const s = await tx.student.create({
        data: {
          fullName, phone, phone2, category: CATEGORY, groupId: group ? group.id : null, registeredAt,
          total: tariff.total, extStage1: tariff.extStage1, extStage2: tariff.extStage2, instructorShare: tariff.instructorShare,
          discount, discountReason: discount ? 'Import: kelishilgan narx' : null,
          docApproved, docApprovedAt: docApproved ? registeredAt : null,
          externalTransferred: ext, deadline: F.calcDeadline(registeredAt),
        },
      });
      for (const p of pays) {
        await tx.payment.create({ data: { studentId: s.id, amount: p.amount, note: 'Import (eski sheet)', createdBy: actor, paidAt: p.date } });
      }
      await tx.auditLog.create({ data: { actorId: actor, action: 'STUDENT_IMPORT', entity: 'Student', entityId: s.id, data: { row: n, price, paid } } });
    });
    console.log('✓ ' + line); ok++;
  }
  console.log(`\nTayyor: ${ok} ta ${APPLY ? "qo'shildi" : '(sinov)'}${skip ? `, ${skip} ta o'tkazildi` : ''}${warn ? `, ${warn} ta ogohlantirish` : ''}`);
  if (prisma) await prisma.$disconnect();
}
main().catch((e) => { console.error('XATO:', e.message); process.exit(1); });