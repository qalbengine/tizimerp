const test = require('node:test');
const assert = require('node:assert');
const { buildReceiptPdf, calcAsOf, receiptSig, qrPayload } = require('../src/receiptPdf');
const M = 1_000_000;
const student = { id: 7, fullName: "Ergashev Doniyor Bahodir o'g'li", category: 'B', total: 5.5 * M, extStage1: M, extStage2: M, instructorShare: 0.5 * M, discount: 0, docApproved: false, externalTransferred: 0 };
const p1 = { id: 11, studentId: 7, amount: M, status: 'ACTIVE', paidAt: new Date(2026, 5, 16, 13, 53, 28), note: "Ro'yxat to'lovi" };
const p2 = { id: 12, studentId: 7, amount: 531000, status: 'ACTIVE', paidAt: new Date(), note: null };
student.payments = [p1, p2];
student.endDate = new Date(2027, 0, 30);

test('PDF chek yaratiladi', async () => {
  const buf = await buildReceiptPdf({ student, payment: p2, calcAsOf: 0, calc: calcAsOf(student, p2) });
  assert.equal(buf.slice(0, 4).toString(), '%PDF');
  assert.ok(buf.length > 5000);
  require('fs').writeFileSync(process.env.OUT || '/tmp/chek.pdf', buf);
});

test('bekor qilingan chek', async () => {
  const c = { ...p2, status: 'CANCELLED', cancelReason: 'Xato kiritilgan' };
  const buf = await buildReceiptPdf({ student, payment: c, calc: calcAsOf(student, c) });
  assert.equal(buf.slice(0, 4).toString(), '%PDF');
  require('fs').writeFileSync('/tmp/chek-cancel.pdf', buf);
});

test('chekdan keyingi holat', () => {
  assert.equal(calcAsOf(student, p1).paid, M);
  assert.equal(calcAsOf(student, p2).paid, M + 531000);
});

test('QR kod: deterministik va summa o\'zgarsa kod o\'zgaradi', () => {
  assert.equal(receiptSig(p2), receiptSig({ ...p2 }));
  assert.notEqual(receiptSig(p2), receiptSig({ ...p2, amount: 1 }));
  assert.match(qrPayload(p2), /Chek №12[\s\S]*Kod: [0-9a-f]{10}$/);
});
