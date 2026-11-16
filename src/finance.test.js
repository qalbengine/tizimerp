const test = require('node:test');
const assert = require('node:assert');
const F = require('../src/finance');
const M = 1_000_000;

const B = { total: 5.5 * M, extStage1: M, extStage2: M, instructorShare: 0.5 * M, discount: 0, docApproved: false, externalTransferred: 0 };
const BC = { total: 7.2 * M, extStage1: M, extStage2: 2.5 * M, instructorShare: M, discount: 0, docApproved: false, externalTransferred: 0 };
const pay = (a) => ({ amount: a, status: 'ACTIVE' });

test('sof foyda tariflar jadvaliga mos', () => {
  assert.equal(F.calc(B, []).expectedProfit, 3.0 * M);
  assert.equal(F.calc(BC, []).expectedProfit, 2.7 * M);
});

test('chegirma: B 500 ming -> 5,0 mln, foyda 2,5 mln', () => {
  const c = F.calc({ ...B, discount: 0.5 * M }, []);
  assert.equal(c.net, 5.0 * M);
  assert.equal(c.expectedProfit, 2.5 * M);
});

test("to'lov tartibi va muddatli qarz", () => {
  let c = F.calc(B, [pay(1.5 * M)]);
  assert.equal(c.stage1.paid, M);
  assert.equal(c.stage2.paid, 0.5 * M);
  assert.equal(c.dueNow, 0);
  c = F.calc({ ...B, docApproved: true }, [pay(1.5 * M)]);
  assert.equal(c.dueNow, 0.5 * M);
  assert.equal(c.debt, 4.0 * M);
});

test('muddatlar', () => {
  const reg = new Date(2026, 0, 31);
  assert.equal(F.calcDeadline(reg).toDateString(), new Date(2026, 3, 25).toDateString());
  const st = new Date(2026, 0, 10);
  assert.equal(F.calcEnd(st).toDateString(), new Date(2026, 2, 25).toDateString());
});

test('summarize: tashqi to\'lov 2 bosqich bo\'yicha', () => {
  const s = { total: 5.5 * M, discount: 0, extStage1: 1 * M, extStage2: 1 * M, instructorShare: 0.5 * M, docApproved: true,
    instructorPaid: false, externalTransferred: 1.5 * M, payments: [{ status: 'ACTIVE', amount: 1.8 * M }] };
  const r = F.summarize([s]);
  assert.deepEqual(r.ext1, { due: 1 * M, paid: 1 * M, transferred: 1 * M });
  assert.deepEqual(r.ext2, { due: 1 * M, paid: 0.8 * M, transferred: 0.5 * M });
});