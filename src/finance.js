'use strict';
// Sof hisob-kitob funksiyalari (bazasiz). Hamma summa so'mda, butun son.
// Server vaqt zonasi: TZ=Asia/Tashkent

const MIN_REGISTRATION_PAYMENT = 1_000_000; // ro'yxatdan o'tish uchun minimal to'lov

function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
const calcEnd = (start) => addDays(addMonths(start, 2), 15);   // boshlanish + 2 oy 15 kun
const calcDeadline = (reg) => addDays(addMonths(reg, 2), 25);  // ro'yxat + 2 oy 25 kun
const maxStart = (reg) => addDays(reg, 10);                     // boshlanish ko'pi bilan +10 kun

// s: Student, payments: Payment[]
function calc(s, payments = []) {
  const paid = payments.filter((p) => p.status === 'ACTIVE').reduce((a, p) => a + p.amount, 0);
  const net = s.total - s.discount;
  const rest = net - s.extStage1 - s.extStage2; // markazga qoladigan qism (instruktorgacha)

  // To'lov tartibi: 1-bosqich -> 2-bosqich -> qolgan qism
  const p1 = Math.min(paid, s.extStage1);
  const p2 = Math.min(paid - p1, s.extStage2);
  const pr = Math.min(paid - p1 - p2, Math.max(rest, 0));

  const debt = Math.max(net - paid, 0);
  const dueNow = (s.extStage1 - p1) + (s.docApproved ? s.extStage2 - p2 : 0); // muddatli qarz
  const extReceived = p1 + p2; // tashqariga o'tkazilishi kerak
  const centerIncome = pr;     // markaz tushumi

  return {
    paid, net, rest, debt, dueNow,
    stage1: { due: s.extStage1, paid: p1 },
    stage2: { due: s.extStage2, paid: p2, active: s.docApproved },
    restPart: { due: Math.max(rest, 0), paid: pr },
    extReceived,
    extT1: Math.min(s.externalTransferred, p1),
    extT2: Math.min(Math.max(s.externalTransferred - p1, 0), p2),
    extToTransfer: Math.max(extReceived - s.externalTransferred, 0),
    centerIncome,
    expectedProfit: net - s.extStage1 - s.extStage2 - s.instructorShare,
    receivedProfit: centerIncome - (s.instructorPaid ? s.instructorShare : 0),
  };
}

// students: [{...student, payments: []}]
function summarize(students) {
  const r = {
    count: students.length, cashIn: 0, extToTransfer: 0, extTransferred: 0,
    centerIncome: 0, instrAccrued: 0, instrPaid: 0, discounts: 0, expectedProfit: 0, receivedProfit: 0, debt: 0,
  };
  r.ext1 = { due: 0, paid: 0, transferred: 0 };
  r.ext2 = { due: 0, paid: 0, transferred: 0 };
  for (const s of students) {
    const c = calc(s, s.payments);
    r.ext1.due += s.extStage1; r.ext1.paid += c.stage1.paid; r.ext1.transferred += c.extT1;
    r.ext2.due += s.extStage2; r.ext2.paid += c.stage2.paid; r.ext2.transferred += c.extT2;
    r.cashIn += c.paid;
    r.extToTransfer += c.extReceived;
    r.extTransferred += s.externalTransferred;
    r.instrAccrued += s.instructorShare;
    if (s.instructorPaid) r.instrPaid += s.instructorShare;
    r.centerIncome += c.centerIncome;
    r.discounts += s.discount;
    r.expectedProfit += c.expectedProfit;
    r.receivedProfit += c.receivedProfit;
    r.debt += c.debt;
  }
  r.extBalance = r.extToTransfer - r.extTransferred;
  r.instrOwed = r.instrAccrued - r.instrPaid;
  return r;
}

const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n) + " so'm";

module.exports = { MIN_REGISTRATION_PAYMENT, addMonths, addDays, calcEnd, calcDeadline, maxStart, calc, summarize, fmt };