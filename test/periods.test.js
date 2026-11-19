const test = require('node:test');
const assert = require('node:assert');

test('davrlar: kun, hafta (dushanbadan), oy, hammasi', async () => {
  const P = await import('../web/src/periods.js');
  const d = new Date(2026, 10, 19); // 19.11.2026 payshanba
  assert.deepEqual(P.range('day', d), { from: '2026-11-19', to: '2026-11-20', label: '19 noyabr 2026' });
  const w = P.range('week', d);
  assert.equal(w.from, '2026-11-16'); assert.equal(w.to, '2026-11-23');
  const m = P.range('month', d);
  assert.deepEqual([m.from, m.to, m.label], ['2026-11-01', '2026-12-01', 'Noyabr 2026']);
  assert.equal(P.range('month', new Date(2026, 11, 31)).to, '2027-01-01');
  assert.equal(P.range('all').label, 'Barcha vaqt');
  assert.equal(P.ymd(P.shift('month', d, -1)), '2026-10-01');
  assert.equal(P.ymd(P.shift('month', new Date(2026, 0, 15), -1)), '2025-12-01');
  assert.equal(P.ymd(P.shift('week', d, 1)), '2026-11-26');
  assert.equal(P.bucketLabel('2026-11', 'month'), 'Noyabr 2026');
  assert.equal(P.bucketLabel('2026-11-16', 'week'), '16.11 – 22.11');
  assert.equal(P.bucketLabel('2026-11-16', 'day'), '16.11.2026');
});
