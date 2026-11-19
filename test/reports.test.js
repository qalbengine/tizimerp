const test = require('node:test');
const assert = require('node:assert');
const { db } = require('./fakePrisma');
process.env.TZ = 'Asia/Tashkent';

const F = require('../src/finance');
const Rep = require('../src/reports');
const M = 1_000_000;
const D = (s) => new Date(`${s}T10:00:00+05:00`);
const base = { category: 'B', status: 'ACTIVE', total: 5.5 * M, extStage1: M, extStage2: M, instructorShare: 0.5 * M, discount: 0, docApproved: true,
  externalTransferred: 0, instructorPaid: false, instructorPaidAt: null, deletedAt: null, startDate: null, endDate: null, instructorId: null, groupId: null,
  deadline: D('2099-01-01'), registeredAt: D('2026-10-01'), phone: '1', phone2: null };
const pay = (id, studentId, amount, date) => ({ id, studentId, amount, paidAt: D(date), status: 'ACTIVE', note: null });

test.before(() => {
  db.group.push({ id: 1, name: '12-26' }, { id: 2, name: '13-26' });
  db.instructor.push({ id: 1, telegramId: 5n, name: 'Kadir', active: true });
  db.student.push(
    { ...base, id: 1, fullName: 'Ali', groupId: 1, instructorId: 1, instructorPaid: true, instructorPaidAt: D('2026-11-10') },
    { ...base, id: 2, fullName: 'Vali', groupId: 1, instructorId: 1, discount: 0.5 * M, registeredAt: D('2026-11-02'), deadline: D('2026-11-05') },
    { ...base, id: 3, fullName: 'Sami', registeredAt: D('2026-11-12') },
  );
  db.payment.push(
    pay(1, 1, 1 * M, '2026-10-01'), pay(2, 1, 4.5 * M, '2026-11-10'),
    pay(3, 2, 2 * M, '2026-11-02'),
    pay(4, 3, 1 * M, '2026-11-12'),
  );
});

test('allocate: tashqi + markaz yig\'indisi calc bilan mos', () => {
  for (const s of db.student) {
    const ps = db.payment.filter((p) => p.studentId === s.id);
    const a = F.allocate(s, ps); const c = F.calc(s, ps);
    assert.equal(a.reduce((x, y) => x + y.ext, 0), c.extReceived);
    assert.equal(a.reduce((x, y) => x + y.center, 0), c.centerIncome);
    assert.equal(a.reduce((x, y) => x + y.amount, 0), c.paid);
  }
});

test('overview: noyabr oyi, xarajat va instruktor hisobga olinadi', async () => {
  await Rep.addExpense(111, { amount: 300000, category: 'Ijara', note: 'ofis', spentAt: D('2026-11-05') });
  await Rep.addExpense(111, { amount: 100000, category: "Yoqilg'i", spentAt: D('2026-11-06') });
  const o = await Rep.overview(D('2026-11-01'), D('2026-12-01'), 'week');
  // noyabrda tushgan: 4.5 + 2 + 1 = 7.5 mln; ext: s1 (birinchi 1M oktyabrda ext) -> noyabrda 1M ext + 3.5M center; s2: 2M ext; s3: 1M ext
  assert.equal(o.period.cashIn, 7.5 * M);
  assert.equal(o.period.ext + o.period.center, o.period.cashIn);
  assert.equal(o.period.ext, 1 * M + 2 * M + 1 * M);
  assert.equal(o.period.center, 3.5 * M);
  assert.equal(o.period.instrPaid, 0.5 * M);
  assert.equal(o.period.expenses, 400000);
  assert.equal(o.period.profit, 3.5 * M - 0.5 * M - 400000);
  assert.equal(o.registered.count, 2);              // Vali, Sami noyabrda
  assert.equal(o.registered.discountCount, 1);
  assert.equal(o.registered.discountSum, 0.5 * M);
  assert.equal(o.debt.count, 2);                    // Vali (3M qoldi), Sami (4.5M qoldi)
  assert.equal(o.debt.overdue, 1);                  // Vali muddati o'tgan
  assert.ok(o.series.length >= 2 && o.series.every((x) => x.profit === x.center - x.instr - x.expense));
  const total = o.series.reduce((a, x) => a + x.cashIn, 0);
  assert.equal(total, o.period.cashIn, 'qatorlar yig\'indisi jami bilan teng');
});

test('guruhlar hisoboti', async () => {
  const g = await Rep.groupsReport();
  const g1 = g.find((x) => x.id === 1);
  assert.equal(g1.count, 2); assert.equal(g1.paidFull, 1); assert.equal(g1.inDebt, 1); assert.equal(g1.overdue, 1);
  assert.equal(g1.discountCount, 1); assert.equal(g1.debt, 3 * M); // Vali: 5.0 mln (chegirmadan keyin) - 2 mln
  assert.equal(g1.instrPaid, 0.5 * M); assert.equal(g1.instrOwed, 0.5 * M);
  assert.equal(g1.debtors[0].fullName, 'Vali');
  assert.equal(g.find((x) => x.name === 'Guruhsiz').count, 1);
  assert.equal(g.find((x) => x.id === 2).count, 0);
});

test('instruktorlar hisoboti va guruh bo\'yicha "to\'landi"', async () => {
  let r = await Rep.instructorsReport(D('2026-11-01'), D('2026-12-01'), 'day');
  const k = r.items[0];
  assert.equal(k.name, 'Kadir'); assert.equal(k.paidInPeriod, 0.5 * M); assert.equal(k.payments[0].fullName, 'Ali');
  assert.equal(k.owed, 0.5 * M); assert.equal(r.unassigned.count, 1);
  const res = await Rep.markGroupInstructorPaid(111, 1);
  assert.deepEqual(res, { count: 1, sum: 0.5 * M });
  r = await Rep.instructorsReport(D('2026-11-01'), new Date(Date.now() + 86400000), 'month');
  assert.equal(r.items[0].owed, 0); assert.equal(r.totals.paidAll, 1 * M);
  assert.deepEqual(await Rep.markGroupInstructorPaid(111, 1), { count: 0, sum: 0 });
});

test('xarajat: ro\'yxat, tur bo\'yicha, bekor qilish, tekshiruvlar', async () => {
  let l = await Rep.listExpenses(D('2026-11-01'), D('2026-12-01'));
  assert.equal(l.total, 400000); assert.equal(l.count, 2); assert.equal(l.byCategory[0].category, 'Ijara');
  await assert.rejects(Rep.addExpense(111, { amount: 0, category: 'Ijara' }), /Summa/);
  await assert.rejects(Rep.addExpense(111, { amount: 1000, category: 'Noma\'lum' }), /Turi/);
  await assert.rejects(Rep.cancelExpense(111, l.items[0].id, ''), /sabab/);
  await Rep.cancelExpense(111, l.items[0].id, 'xato kiritilgan');
  l = await Rep.listExpenses(D('2026-11-01'), D('2026-12-01'));
  assert.equal(l.count, 1);
  await assert.rejects(Rep.cancelExpense(111, 9999, 'sabab yoq'), /topilmadi/);
  assert.ok(Rep.formatOverview(await Rep.overview(D('2026-11-01'), D('2026-12-01'))).includes('Sof foyda'));
});
