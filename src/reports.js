'use strict';
// Hisobotlar: umumiy (davr bo'yicha), guruhlar, instruktorlar, xarajatlar.
// Hisob "pul bo'yicha": davrda kassaga tushgan pul -> tashqi qismi + markazda qolgani; undan instruktorga
// to'langan va xarajatlar ayiriladi. Hammasi mavjud finance.js qoidalaridan olinadi.
const S = require('./services');
const F = require('./finance');
const prisma = S.prisma;

const err = (code, msg) => Object.assign(new Error(msg), { code });
const CATEGORIES = ['Ijara', 'Maosh', "Yoqilg'i", "Ta'mir", 'Reklama', 'Kommunal', 'Soliq', 'Boshqa'];
const p2 = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const inRange = (d, from, to) => { if (!d) return false; const t = new Date(d); return t >= from && t < to; };

function bucketKey(date, by) {
  const d = new Date(date);
  if (by === 'month') return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
  if (by === 'week') {
    const w = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); // dushanba
    return dkey(w);
  }
  return dkey(d);
}
function mkSeries(by, fields) {
  const m = new Map();
  return {
    add(date, field, v) {
      const k = bucketKey(date, by);
      const r = m.get(k) || Object.assign({ key: k }, ...fields.map((f) => ({ [f]: 0 })));
      r[field] += v; m.set(k, r);
    },
    list(extra) { return [...m.values()].map((r) => (extra ? extra(r) : r)).sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 120); },
  };
}

// ---------- Umumiy ----------
async function overview(from, to, by = 'day') {
  const [students, expenses] = await Promise.all([
    prisma.student.findMany({ where: { deletedAt: null }, include: { payments: true } }),
    prisma.expense.findMany({ where: { cancelledAt: null, spentAt: { gte: from, lt: to } } }),
  ]);
  const ser = mkSeries(by, ['cashIn', 'ext', 'center', 'instr', 'expense']);
  const now = new Date();
  const r = { cashIn: 0, ext: 0, center: 0, instrPaid: 0, instrPaidCount: 0, expenses: 0, expenseCount: expenses.length };
  const debt = { total: 0, count: 0, overdue: 0, overdueSum: 0, dueNow: 0 };
  const reg = { count: 0, discountCount: 0, discountSum: 0 };
  const all = { count: students.length, discountCount: 0, discountSum: 0 };
  let extBalance = 0; let extTransferred = 0;

  for (const s of students) {
    const c = F.calc(s, s.payments);
    for (const a of F.allocate(s, s.payments)) {
      if (!inRange(a.paidAt, from, to)) continue;
      r.cashIn += a.amount; r.ext += a.ext; r.center += a.center;
      ser.add(a.paidAt, 'cashIn', a.amount); ser.add(a.paidAt, 'ext', a.ext); ser.add(a.paidAt, 'center', a.center);
    }
    if (s.instructorPaid && inRange(s.instructorPaidAt, from, to)) {
      r.instrPaid += s.instructorShare; r.instrPaidCount++; ser.add(s.instructorPaidAt, 'instr', s.instructorShare);
    }
    if (c.debt > 0) {
      debt.total += c.debt; debt.count++; debt.dueNow += c.dueNow;
      if (s.deadline && s.deadline < now) { debt.overdue++; debt.overdueSum += c.debt; }
    }
    extBalance += c.extToTransfer; extTransferred += s.externalTransferred;
    if (s.discount > 0) { all.discountCount++; all.discountSum += s.discount; }
    if (inRange(s.registeredAt, from, to)) {
      reg.count++;
      if (s.discount > 0) { reg.discountCount++; reg.discountSum += s.discount; }
    }
  }
  for (const e of expenses) { r.expenses += e.amount; ser.add(e.spentAt, 'expense', e.amount); }
  r.profit = r.center - r.instrPaid - r.expenses;
  return {
    by, period: r, debt, registered: reg, discountsAll: all,
    ext: { received: r.ext, balanceAll: extBalance, transferredAll: extTransferred },
    series: ser.list((x) => ({ ...x, profit: x.center - x.instr - x.expense })),
  };
}

// ---------- Guruhlar ----------
async function groupsReport() {
  const [groups, students] = await Promise.all([
    prisma.group.findMany({}),
    prisma.student.findMany({ where: { deletedAt: null }, include: { payments: true } }),
  ]);
  const now = new Date();
  const byGroup = new Map();
  for (const s of students) { const k = s.groupId || 0; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(s); }
  const build = (id, name) => {
    const list = byGroup.get(id) || [];
    const debtors = list.map((s) => ({ s, c: F.calc(s, s.payments) })).filter((x) => x.c.debt > 0)
      .sort((a, b) => b.c.debt - a.c.debt)
      .map(({ s, c }) => ({ id: s.id, fullName: s.fullName, debt: c.debt, paid: c.paid, deadline: s.deadline, overdue: !!(s.deadline && s.deadline < now) }));
    const sum = F.summarize(list);
    return { id, name, ...sum, ...F.groupStats(list, now), extBalance: sum.extToTransfer - sum.extTransferred, instrOwed: sum.instrAccrued - sum.instrPaid, debtors };
  };
  const out = groups.map((g) => build(g.id, g.name)).sort((a, b) => a.name.localeCompare(b.name, 'uz', { numeric: true }));
  if (byGroup.has(0)) out.push(build(0, 'Guruhsiz'));
  return out;
}

// ---------- Instruktorlar ----------
async function instructorsReport(from, to, by = 'day') {
  const [instructors, students] = await Promise.all([
    prisma.instructor.findMany({ where: { active: true } }),
    prisma.student.findMany({ where: { deletedAt: null }, include: { group: true } }),
  ]);
  const ser = mkSeries(by, ['count', 'sum']);
  const items = instructors.map((i) => {
    const mine = students.filter((s) => s.instructorId === i.id);
    const accrued = mine.reduce((a, s) => a + s.instructorShare, 0);
    const paidAll = mine.filter((s) => s.instructorPaid).reduce((a, s) => a + s.instructorShare, 0);
    const payments = mine.filter((s) => s.instructorPaid && inRange(s.instructorPaidAt, from, to))
      .sort((a, b) => new Date(b.instructorPaidAt) - new Date(a.instructorPaidAt))
      .map((s) => ({ studentId: s.id, fullName: s.fullName, group: s.group ? s.group.name : null, amount: s.instructorShare, paidAt: s.instructorPaidAt }));
    payments.forEach((p) => { ser.add(p.paidAt, 'count', 1); ser.add(p.paidAt, 'sum', p.amount); });
    return {
      id: i.id, name: i.name, telegramId: String(i.telegramId), count: mine.length, accrued, paidAll, owed: accrued - paidAll,
      paidInPeriod: payments.reduce((a, p) => a + p.amount, 0), payments,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'uz'));
  const free = students.filter((s) => !s.instructorId);
  return {
    by, items, series: ser.list(),
    totals: {
      accrued: items.reduce((a, x) => a + x.accrued, 0), paidAll: items.reduce((a, x) => a + x.paidAll, 0),
      owed: items.reduce((a, x) => a + x.owed, 0), paidInPeriod: items.reduce((a, x) => a + x.paidInPeriod, 0),
    },
    unassigned: { count: free.length, accrued: free.reduce((a, s) => a + s.instructorShare, 0) },
  };
}

// Guruhdagi instruktori bor, hali to'lanmagan hamma o'quvchi uchun ulushni "to'landi" deb belgilash
async function markGroupInstructorPaid(actor, groupId) {
  const list = await prisma.student.findMany({ where: { groupId, deletedAt: null } });
  const todo = list.filter((s) => s.instructorId && !s.instructorPaid);
  let sum = 0;
  await prisma.$transaction(async (tx) => {
    for (const s of todo) {
      await tx.student.update({ where: { id: s.id }, data: { instructorPaid: true, instructorPaidAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: BigInt(actor), action: 'INSTR_PAID', entity: 'Student', entityId: s.id, data: { amount: s.instructorShare, group: groupId } } });
      sum += s.instructorShare;
    }
  });
  return { count: todo.length, sum };
}

// ---------- Xarajatlar ----------
async function addExpense(actor, d) {
  const amount = d.amount;
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000_000) throw err('BAD_AMOUNT', "Summa noto'g'ri");
  if (!CATEGORIES.includes(d.category)) throw err('BAD_CATEGORY', "Turi noto'g'ri");
  const note = String(d.note || '').trim().slice(0, 200) || null;
  const spentAt = d.spentAt || new Date();
  return prisma.$transaction(async (tx) => {
    const e = await tx.expense.create({ data: { amount, category: d.category, note, spentAt, createdBy: BigInt(actor) } });
    await tx.auditLog.create({ data: { actorId: BigInt(actor), action: 'EXPENSE_CREATE', entity: 'Expense', entityId: e.id, data: { amount, category: d.category } } });
    return e;
  });
}
async function listExpenses(from, to) {
  const list = (await prisma.expense.findMany({ where: { cancelledAt: null, spentAt: { gte: from, lt: to } } }))
    .sort((a, b) => new Date(b.spentAt) - new Date(a.spentAt) || b.id - a.id);
  const byCat = new Map();
  for (const e of list) byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);
  return {
    total: list.reduce((a, e) => a + e.amount, 0), count: list.length,
    byCategory: [...byCat].map(([category, sum]) => ({ category, sum })).sort((a, b) => b.sum - a.sum),
    items: list.map((e) => ({ id: e.id, amount: e.amount, category: e.category, note: e.note, spentAt: e.spentAt })),
    categories: CATEGORIES,
  };
}
async function cancelExpense(actor, id, reason) {
  const e = await prisma.expense.findFirst({ where: { id, cancelledAt: null } });
  if (!e) throw err('NOT_FOUND', 'Xarajat topilmadi');
  const why = String(reason || '').trim();
  if (why.length < 3) throw err('BAD_REASON', 'Bekor qilish sababini yozing');
  return prisma.$transaction(async (tx) => {
    await tx.expense.update({ where: { id }, data: { cancelledAt: new Date(), cancelledBy: BigInt(actor), cancelReason: why } });
    await tx.auditLog.create({ data: { actorId: BigInt(actor), action: 'EXPENSE_CANCEL', entity: 'Expense', entityId: id, data: { reason: why, amount: e.amount } } });
    return { ok: true };
  });
}

// ---------- Bot uchun matn ----------
function formatOverview(o) {
  const p = o.period; const f = F.fmt;
  return [
    `💰 Kassaga tushgan: ${f(p.cashIn)}`,
    `   🏦 tashqariga ketadigan qismi: ${f(p.ext)}`,
    `   📈 markazda qolgan: ${f(p.center)}`,
    `👨‍🏫 Instruktorga to'langan: ${f(p.instrPaid)}`,
    `🧾 Xarajatlar: ${f(p.expenses)}`,
    `✅ Sof foyda: ${f(p.profit)}`,
    ``,
    `🏦 Tashqariga o'tkazilmagan (jami): ${f(o.ext.balanceAll)}`,
    `⚠️ Qarz (hozir): ${f(o.debt.total)} · ${o.debt.count} ta, muddati o'tgan ${o.debt.overdue} ta`,
    `👥 Yangi o'quvchi: ${o.registered.count} ta, chegirmada ${o.registered.discountCount} ta (${f(o.registered.discountSum)})`,
  ].join('\n');
}

module.exports = { CATEGORIES, overview, groupsReport, instructorsReport, markGroupInstructorPaid, addExpense, listExpenses, cancelExpense, formatOverview };
