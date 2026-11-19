const test = require('node:test');
const assert = require('node:assert');

const base = (o) => ({ id: 1, fullName: 'Ali Valiyev', category: 'B', registeredAt: '2026-10-01', deadline: '2099-01-01', net: 5500000, paid: 0, debt: 5500000, dueNow: 0, phone: '901234567', phone2: null, group: null, ...o });

test('payState: holatlar', async () => {
  const L = await import('../web/src/studentLogic.js');
  const now = new Date('2026-11-01');
  assert.equal(L.payState(base({ debt: 0, paid: 5500000 }), now), 'paid');
  assert.equal(L.payState(base({ deadline: '2026-10-01', paid: 1000000, debt: 4500000 }), now), 'overdue');
  assert.equal(L.payState(base({ dueNow: 1000000, paid: 1000000, debt: 4500000 }), now), 'due');
  assert.equal(L.payState(base({ paid: 1000000, debt: 4500000 }), now), 'partial');
  assert.equal(L.payState(base(), now), 'unpaid');
});

test('qidiruv: ism, telefon, #ID', async () => {
  const L = await import('../web/src/studentLogic.js');
  const a = base({ id: 7 }); const b = base({ id: 8, fullName: 'Vali Karimov', phone: '931112233' });
  assert.deepEqual(L.applyFilters([a, b], { q: 'karim' }).map((s) => s.id), [8]);
  assert.deepEqual(L.applyFilters([a, b], { q: '+998 93 111 22 33' }).map((s) => s.id), [8]);
  assert.deepEqual(L.applyFilters([a, b], { q: '#7' }).map((s) => s.id), [7]);
});

test('filtr va saralash', async () => {
  const L = await import('../web/src/studentLogic.js');
  const list = [
    base({ id: 1, group: { id: 1, name: 'G1' }, debt: 0, paid: 5500000, registeredAt: '2026-09-01' }),
    base({ id: 2, category: 'BC', debt: 3000000, registeredAt: '2026-10-01' }),
    base({ id: 3, group: { id: 2, name: 'G2' }, debt: 500000, fullName: 'Aziz', registeredAt: '2026-11-01' }),
  ];
  const ids = (o) => L.applyFilters(list, o).map((s) => s.id);
  assert.deepEqual(ids({ status: 'debtors', sort: 'debt-desc' }), [2, 3]);
  assert.deepEqual(ids({ status: 'paid' }), [1]);
  assert.deepEqual(ids({ status: 'ungrouped' }), [2]);
  assert.deepEqual(ids({ category: 'BC' }), [2]);
  assert.deepEqual(ids({ group: '2' }), [3]);
  assert.deepEqual(ids({ sort: 'newest' }), [3, 2, 1]);
  assert.deepEqual(ids({ sort: 'oldest' }), [1, 2, 3]);
  assert.deepEqual(ids({ sort: 'name' }), [1, 2, 3]); // Ali, Ali, Aziz
  assert.deepEqual(L.computeStats(list), { total: 3, debtors: 2, paid: 1, debt: 3500000 });
  assert.equal(L.paidPercent(base({ paid: 2750000 })), 50);
});
