// Bazadagi hamma o'quvchi/to'lov/guruhni (zaxira faylga saqlab) o'chirib, yangi CSV dan joylaydi.
// Sinov (hech narsa o'zgarmaydi):  node scripts/import-groupb.js group_b.csv
// Haqiqiy:                          node scripts/import-groupb.js group_b.csv --apply
// Ixtiyoriy: --category=B  --both-to=140 (shu qatorgacha 2 ta tashqi o'tkazma o'tgan, keyingilarda faqat 1-bosqich)
require('dotenv').config();
const fs = require('fs');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const APPLY = args.includes('--apply');
const CATEGORY = opt('category', 'B');
const BOTH_TO = Number(opt('both-to', 140));
if (!file) { console.error('Fayl nomini bering: node scripts/import-groupb.js group_b.csv'); process.exit(1); }

const DEFAULT_TARIFF = { total: 5500000, extStage1: 1000000, extStage2: 1000000, instructorShare: 500000 };
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false, line = 1, startLine = 1;
  text = text.replace(/^﻿/, '');
  const push = () => { row.push(cur); rows.push({ cells: row, line: startLine }); row = []; cur = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else { cur += c; if (c === '\n') line++; } }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; push(); line++; startLine = line; }
    else cur += c;
  }
  if (cur !== '' || row.length) push();
  return rows;
}
const norm = (s) => String(s || '').toLowerCase().replace(/[’ʻʼ`‘']/g, "'").replace(/\s+/g, ' ').trim();
const digits = (s) => parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;
function parsePhones(raw) {
  raw = String(raw || '').trim();
  let nums = raw.split(/[\s,;\n]+/).map((x) => x.replace(/\D/g, '').slice(-9)).filter((x) => x.length >= 9);
  if (!nums.length) { const d = raw.replace(/\D/g, ''); if (d.length >= 9 && d.length <= 12) nums = [d.slice(-9)]; }
  return nums.length ? { phone: nums[0], phone2: nums[1] || null } : { phone: raw || '-', phone2: null };
}
function parseDate(s, h = 9, m = 0) {
  const x = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(s || ''));
  if (!x) return null;
  const p = (n) => String(n).padStart(2, '0');
  return new Date(`${x[3]}-${p(x[2])}-${p(x[1])}T${p(h)}:${p(m)}:00+05:00`);
}
function parseHistory(s) {
  const out = []; const re = /(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*\|\s*(\d+)/g; let m;
  while ((m = re.exec(String(s || '')))) out.push({ date: parseDate(m[1], +(m[2] || 9), +(m[3] || 0)), amount: +m[4] });
  return out;
}
const tashkentMonth = (d) => { const t = new Date(d.getTime() + 5 * 3600e3); return [t.getUTCFullYear(), t.getUTCMonth()]; };

function readStudents(tariff) {
  let rows = parseCsv(fs.readFileSync(file, 'utf8')).filter((r) => String(r.cells[0] || '').trim());
  // Sarlavha qatori bo'lsa tashlab yuboramiz
  if (rows.length && !/\d/.test(String(rows[0].cells[2] || ''))) rows = rows.slice(1);
  return rows.map((r) => {
    const c = r.cells;
    const fullName = String(c[0]).replace(/\s+/g, ' ').trim();
    const { phone, phone2 } = parsePhones(c[1]);
    let price = digits(c[2]) || tariff.total;
    const paid = digits(c[3]);
    let pays = parseHistory(c[7]);
    const firstPay = pays.length ? pays.map((p) => p.date).sort((a, b) => a - b)[0] : null;
    const registeredAt = parseDate(c[5]) || firstPay || new Date();
    const sum = pays.reduce((a, p) => a + p.amount, 0);
    let note = '';
    if (sum !== paid) {
      if (pays.length && sum < paid) { note = `history ${sum} < to'lovi ${paid}: ${paid - sum} ro'yxat sanasiga qo'shildi`; pays = [{ date: registeredAt, amount: paid - sum }, ...pays]; }
      else if (pays.length) { note = `history ${sum} > to'lovi ${paid}: bitta to'lov qilindi`; pays = paid > 0 ? [{ date: registeredAt, amount: paid }] : []; }
      else pays = paid > 0 ? [{ date: registeredAt, amount: paid }] : [];
    }
    const [y, mo] = tashkentMonth(registeredAt);
    const p1 = Math.min(paid, tariff.extStage1); const p2 = Math.min(paid - p1, tariff.extStage2);
    const ext = r.line <= BOTH_TO ? p1 + p2 : p1;
    return { line: r.line, fullName, phone, phone2, price, paid, pays, registeredAt, group: `${MONTHS[mo]} ${y}`, ext, note,
      discount: Math.max(tariff.total - price, 0), docApproved: paid > tariff.extStage1 };
  });
}

async function main() {
  const F = require('../src/finance');
  let prisma = null, tariff = DEFAULT_TARIFF;
  if (APPLY) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    tariff = await prisma.tariff.findUnique({ where: { category: CATEGORY } });
    if (!tariff) throw new Error('Tarif topilmadi');
  }
  const list = readStudents(tariff);
  const groups = {}; list.forEach((s) => { groups[s.group] = (groups[s.group] || 0) + 1; });
  list.forEach((s) => console.log(`• #${s.line} ${s.fullName.padEnd(30)} ${s.phone} narx ${s.price} to'langan ${s.paid} (${s.pays.length} to'lov) chegirma ${s.discount} o'tkazilgan ${s.ext} guruh ${s.group}${s.note ? ' ⚠ ' + s.note : ''}`));
  console.log(`\n${list.length} ta o'quvchi, ${list.filter((s) => s.note).length} ta ogohlantirish`);
  console.log('Guruhlar:', Object.entries(groups).map(([k, v]) => `${k}: ${v}`).join(', '));
  if (!APPLY) { console.log("\nSINOV: bazaga tegilmadi. Yozish uchun oxiriga --apply qo'shing."); return; }

  const actor = BigInt((process.env.ADMIN_IDS || '0').split(',')[0].trim() || 0);
  // 1) zaxira
  const old = { students: await prisma.student.findMany(), payments: await prisma.payment.findMany(), groups: await prisma.group.findMany() };
  const backup = `zaxira-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(backup, JSON.stringify(old, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
  console.log(`\nZaxira saqlandi: ${backup} (${old.students.length} o'quvchi, ${old.payments.length} to'lov)`);
  // 2) o'chirish
  await prisma.payment.deleteMany({}); await prisma.student.deleteMany({}); await prisma.group.deleteMany({});
  console.log("Eski o'quvchilar, to'lovlar va guruhlar o'chirildi");
  // 3) yangilarini joylash
  const gid = {};
  for (const name of Object.keys(groups)) gid[name] = (await prisma.group.create({ data: { name } })).id;
  for (const s of list) {
    await prisma.$transaction(async (tx) => {
      const st = await tx.student.create({ data: {
        fullName: s.fullName, phone: s.phone, phone2: s.phone2, category: CATEGORY, groupId: gid[s.group], registeredAt: s.registeredAt,
        total: tariff.total, extStage1: tariff.extStage1, extStage2: tariff.extStage2, instructorShare: tariff.instructorShare,
        discount: s.discount, discountReason: s.discount ? 'Import: kelishilgan narx' : null,
        docApproved: s.docApproved, docApprovedAt: s.docApproved ? s.registeredAt : null,
        externalTransferred: s.ext, deadline: F.calcDeadline(s.registeredAt) } });
      for (const p of s.pays) await tx.payment.create({ data: { studentId: st.id, amount: p.amount, note: 'Import (eski sheet)', createdBy: actor, paidAt: p.date } });
      await tx.auditLog.create({ data: { actorId: actor, action: 'STUDENT_IMPORT', entity: 'Student', entityId: st.id, data: { row: s.line, price: s.price, paid: s.paid } } });
    });
  }
  console.log(`✓ ${list.length} ta yangi o'quvchi joylandi`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error('XATO:', e.message); process.exit(1); });