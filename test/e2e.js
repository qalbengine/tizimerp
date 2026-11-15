const { db } = require('./fakePrisma');

process.env.BOT_TOKEN = '1:TEST'; process.env.ADMIN_IDS = '111'; process.env.TZ = 'Asia/Tashkent';
const bot = require('../bot');
bot.botInfo = { id: 1, is_bot: true, first_name: 't', username: 't' };
let out = [];
require('telegraf').Telegram.prototype.callApi = async function (method, data) { out.push(`[${method}] ${data.text || data.caption || ''}`.trim()); return { message_id: 1, chat: { id: data.chat_id }, date: 0 }; };

let uid = 1;
const chat = (id) => ({ id, type: 'private' });
const msg = (id, extra) => ({ update_id: uid++, message: { message_id: uid, date: 0, chat: chat(id), from: { id, is_bot: false, first_name: 'u' }, ...extra } });
const text = (id, t) => msg(id, { text: t, ...(t.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: t.split(' ')[0].length }] } : {}) });
const photo = (id, fid) => msg(id, { photo: [{ file_id: fid + '_s', width: 1, height: 1 }, { file_id: fid, width: 2, height: 2 }] });
const cb = (id, data) => ({ update_id: uid++, callback_query: { id: String(uid), chat_instance: 'c', data, from: { id, is_bot: false, first_name: 'u' }, message: { message_id: 1, date: 0, chat: chat(id) } } });
async function send(u, label) { out = []; await bot.handleUpdate(u); console.log(`\n--- ${label}\n` + (out.join('\n') || '(javob yo\'q)')); return out.join('\n'); }
const ok = (c, msg) => { if (!c) { console.log('FAIL:', msg); process.exitCode = 1; } else console.log('OK:', msg); };

(async () => {
  const A = 111, I = 222, X = 333;
  await send(text(X, '/start'), 'begona /start');
  await send(text(A, '/start'), 'admin /start');
  await send(text(A, "Yangi o'quvchi"), 'wizard 1');
  await send(text(A, 'Karimov Aziz Bahodirovich'), 'F.I.O.');
  await send(text(A, '+998 90 123-45-67'), 'tel1');
  await send(text(A, '+998 90 123-45-67'), 'tel2 bir xil (rad etilishi kerak)');
  await send(text(A, '+998 91 765-43-21'), 'tel2');
  await send(cb(A, 'cat_B'), 'toifa B');
  await send(text(A, 'rasm emas'), 'selfi o\'rniga matn');
  await send(photo(A, 'SELFIE'), 'selfi');
  await send(photo(A, 'PASSPORT'), 'pasport');
  await send(text(A, '500000'), "kam to'lov (rad)");
  await send(text(A, '1mln'), "to'lov 1mln");
  const r = await send(cb(A, 'ok'), 'tasdiqlash');
  ok(db.student.length === 1 && db.payment.length === 1, "o'quvchi va birinchi to'lov yaratildi");
  ok(/Chek №1/.test(r) && /4 500 000/.test(r.replace(/\u00a0/g, ' ')), 'chek va qarz 4,5 mln');
  ok(/\[sendDocument\]/.test(r), "ro'yxatdan keyin PDF chek yuborildi");
  ok(db.student[0].phone === '901234567' && db.student[0].phone2 === '917654321', 'telefonlar normallashtirildi');

  await send(text(A, '/instruktor_add 222 Valiyev Ali'), 'instruktor qo\'shish');
  await send(text(A, '/find karimov'), 'qidirish (ism)');
  await send(text(A, '/find +998 91 765-43-21'), 'qidirish (qo\'shimcha tel)');
  await send(text(A, '/find #1'), 'qidirish (#ID)');
  await send(cb(A, 'as_1'), 'instruktor ro\'yxati');
  await send(cb(A, 'asg_1_1'), 'biriktirish');
  ok(db.student[0].instructorId === 1, 'instruktorga biriktirildi');

  await send(cb(A, 'pay_1'), "to'lov boshlash");
  await send(text(A, '9mln'), "ortiqcha to'lov (rad)");
  const rc = await send(text(A, '1.5mln'), "to'lov 1,5 mln");
  ok(/\[sendDocument\]/.test(rc) && db.payment.length === 2, "ikkinchi to'lov va PDF chek");
  await send(cb(A, 'doc_1'), 'hujjat tasdiqlandi');
  await send(cb(A, 'disc_1'), 'chegirma');
  await send(text(A, '500000'), 'chegirma summasi');
  await send(text(A, 'Aksiya'), 'sabab');
  ok(db.student[0].discount === 500000, 'chegirma 500 ming');
  const today = new Date(); const ds = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
  await send(cb(A, 'start_1'), 'boshlanish');
  await send(text(A, ds), 'sana');
  ok(db.student[0].startDate && db.student[0].endDate, 'boshlanish/tugash qo\'yildi');
  await send(cb(A, 'ext_1'), "tashqi o'tkazma");
  await send(text(A, '1mln'), "o'tkazilgan 1 mln");
  await send(cb(A, 'ip_1'), "instruktor ulushi to'landi");
  await send(text(A, 'Guruhlar'), 'guruhlar');
  await send(cb(A, 'grp_new'), 'yangi guruh');
  await send(text(A, 'B-1 noyabr'), 'guruh nomi');
  await send(cb(A, 'grpset_1_1'), 'guruhga biriktirish');
  await send(cb(A, 'gr_1'), 'guruh kartasi');
  await send(text(A, 'Qarzdorlar'), 'qarzdorlar');
  await send(text(A, 'Muddati tugayotganlar'), 'muddati tugayotganlar');
  await send(text(A, 'Hisobot'), 'hisobot menyusi');
  await send(cb(A, 'rep_all'), 'hisobot hammasi');
  await send(text(A, 'Instruktorlar'), 'instruktorlar');
  await send(cb(A, 'pays_1'), "to'lovlar ro'yxati");
  const rcv = await send(cb(A, 'rc_1'), 'PDF chekni qayta olish');
  ok(/\[sendDocument\]/.test(rcv), 'PDF chek tugmasi ishlaydi');
  const RR = require('../src/receiptPdf');
  const good = await send(text(A, `/tekshir 1 ${RR.receiptSig(db.payment[0])}`), 'tekshir (buyruq)');
  ok(/Chek haqiqiy/.test(good), 'haqiqiy chek tasdiqlandi');
  const pasted = await send(text(A, RR.qrPayload(db.payment[0])), 'tekshir (QR matni)');
  ok(/Chek haqiqiy/.test(pasted), 'QR matni yuborilsa tasdiqlandi');
  const bad = await send(text(A, '/tekshir 1 0000000000'), 'tekshir (soxta)');
  ok(/SOXTA/.test(bad), 'soxta kod rad etildi');
  await send(cb(A, 'cx_2'), 'chekni bekor qilish');
  await send(text(A, 'Xato kiritilgan'), 'bekor sababi');
  ok(db.payment[1].status === 'CANCELLED', 'chek bekor qilindi (o\'chirilmadi)');
  ok(db.audit.length >= 10, `audit yozuvlari: ${db.audit.length}`);

  // Instruktor
  await send(text(I, '/start'), 'instruktor /start');
  const card = await send(cb(I, 'st_1'), 'instruktor: o\'z o\'quvchisi kartasi');
  ok(!/Tel:/.test(card), 'instruktor telefonni ko\'rmaydi');
  await send(cb(I, 'pays_1'), "instruktor: to'lovlar");
  const irc = await send(cb(I, 'rc_1'), 'instruktor: PDF chek');
  ok(/\[sendDocument\]/.test(irc), "instruktor o'z o'quvchisi chekini oladi");
  const denied = await send(cb(I, 'pay_1'), "instruktor: to'lov qo'shishga urinish");
  ok(!/Summa/i.test(denied), "instruktor to'lov qo'sha olmaydi");
  await send(cb(I, 'del_1'), "instruktor: o'chirishga urinish");
  ok(!db.student[0].deletedAt, "instruktor o'chira olmaydi");
  await send(text(I, "Mening o'quvchilarim"), "instruktor: o'quvchilarim");
  await send(text(I, 'Hisobot'), 'instruktor: hisobot (taqiqlangan)');
  await send(text(A, "Yangi o'quvchi"), 'wizard 2 (dublikat tekshiruvi)');
  await send(text(A, 'Boshqa Odam Test'), 'f'); await send(text(A, '901234567'), 'dublikat tel'); await send(text(A, '900000001'), 'tel2'); await send(cb(A, 'cat_B'), 'B');
  await send(photo(A, 'S2'), 's'); await send(photo(A, 'P2'), 'p'); await send(text(A, '1mln'), 'sum'); 
  const dup = await send(cb(A, 'ok'), 'dublikat telefon bilan tasdiqlash');
  ok(/allaqachon/.test(dup) && db.student.length === 1, 'dublikat telefon rad etildi');
  await send(cb(A, 'delok_1'), "o'chirish (soft)");
  ok(db.student[0].deletedAt, 'soft-delete');

  // ---- "Qidirish" menyu tugmasi (session bo'sh bo'lganda ham ishlashi kerak)
  await send(text(A, 'Qidirish'), 'menyu: Qidirish');
  await send(text(A, 'Karimov'), 'qidiruv matni');

  // ---- O'quvchilar: guruhsizlarni belgilab biriktirish
  const reg = async (name, p1, p2) => {
    await send(text(A, "Yangi o'quvchi"), 'wizard'); await send(text(A, name), 'f'); await send(text(A, p1), 't1'); await send(text(A, p2), 't2');
    await send(cb(A, 'cat_B'), 'B'); await send(photo(A, 'S'), 's'); await send(photo(A, 'P'), 'p'); await send(text(A, '1mln'), 'sum'); await send(cb(A, 'ok'), 'tasdiq');
  };
  await reg('Aliyev Vali Test', '900000011', '900000012');
  await reg('Sodiqov Sodiq Test', '900000021', '900000022');
  await reg('Rahimov Rahim Test', '900000031', '900000032');
  ok(db.student.length === 4, '3 ta yangi o\'quvchi qo\'shildi');
  await send(text(A, "O'quvchilar"), "O'quvchilar menyusi");
  await send(cb(A, 'ol_yes'), 'Guruhli');
  await send(cb(A, 'ol_no'), 'Guruhsiz ro\'yxat');
  await send(cb(A, 'pk_2'), 'belgilash #2');
  await send(cb(A, 'pk_3'), 'belgilash #3');
  await send(cb(A, 'pk_3'), 'belgini olib tashlash #3');
  await send(cb(A, 'pk_all'), 'sahifani belgilash');
  await send(cb(A, 'pk_clr'), 'tozalash');
  await send(cb(A, 'pk_go'), 'guruh tanlash (hech narsa belgilanmagan)');
  await send(cb(A, 'pk_2'), 'belgilash #2'); await send(cb(A, 'pk_3'), 'belgilash #3');
  await send(cb(A, 'pk_go'), 'guruhlar ro\'yxati');
  const asg = await send(cb(A, 'pkg_1'), 'guruhga biriktirish');
  ok(/2 ta o'quvchi/.test(asg) && db.student[1].groupId === 1 && db.student[2].groupId === 1, 'tanlangan 2 ta o\'quvchi guruhga biriktirildi');
  ok(db.student[3].groupId === null, 'tanlanmagan o\'quvchi guruhsiz qoldi');
  await send(cb(A, 'ol_no'), 'qolgan guruhsizlar');
  await send(cb(A, 'pk_4'), 'belgilash #4');
  await send(cb(A, 'pk_go'), 'guruh tanlash');
  await send(cb(A, 'pk_newgrp'), 'yangi guruh');
  const ng = await send(text(A, 'D-1 dekabr'), 'yangi guruh nomi');
  ok(/Biriktirildi: 1/.test(ng) && db.student[3].groupId === 2, 'yangi guruh yaratilib o\'quvchi biriktirildi');
  const none = await send(cb(I, 'ol_no'), "instruktor: guruhsiz bo'limiga urinish");
  ok(!/Guruhsiz o'quvchilar/.test(none), "instruktor O'quvchilar bo'limini ocha olmaydi");
})().catch((e) => { console.error('E2E XATO', e); process.exit(1); });
