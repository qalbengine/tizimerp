'use strict';
const { PrismaClient } = require('@prisma/client');
const F = require('./finance');
const prisma = new PrismaClient();

const err = (code, msg) => Object.assign(new Error(msg), { code });
const normPhone = (p) => String(p).replace(/\D/g, '').slice(-9);
const audit = (tx, actor, action, entity, entityId, data) =>
  tx.auditLog.create({ data: { actorId: BigInt(actor), action, entity, entityId, data } });

async function getStudent(id, tx = prisma) {
  const s = await tx.student.findFirst({ where: { id, deletedAt: null }, include: { payments: true } });
  if (!s) throw err('NOT_FOUND', "O'quvchi topilmadi");
  return s;
}

// ---------- Ro'yxatga olish ----------
// Majburiy: F.I.O., 2 ta telefon, selfi, pasport rasmi, kamida 1 mln so'm birinchi to'lov.
// O'quvchi va birinchi to'lov bitta tranzaksiyada yaratiladi.
async function registerStudent(actor, d) {
  const { fullName, category, groupId = null, instructorId = null, registeredAt = new Date() } = d;
  if (!fullName || fullName.trim().length < 5) throw err('BAD_NAME', "F.I.O. to'liq emas");
  const ph1 = normPhone(d.phone);
  const ph2 = normPhone(d.phone2 || '');
  if (ph1.length < 9) throw err('BAD_PHONE', "Asosiy telefon noto'g'ri");
  if (ph2.length < 9) throw err('BAD_PHONE2', "Qo'shimcha telefon noto'g'ri");
  if (ph1 === ph2) throw err('SAME_PHONE', "Ikkita telefon har xil bo'lishi kerak");
  if (!d.selfieFileId) throw err('NO_SELFIE', 'Selfi rasm kerak');
  if (!d.passportFileId) throw err('NO_PASSPORT', 'Pasport rasmi kerak');

  const dup = await prisma.student.findFirst({
    where: { deletedAt: null, OR: [{ phone: { in: [ph1, ph2] } }, { phone2: { in: [ph1, ph2] } }] },
  });
  if (dup) throw err('DUPLICATE_PHONE', `Bu telefon allaqachon bor: ${dup.fullName} (#${dup.id})`);

  const t = await prisma.tariff.findUnique({ where: { category } });
  if (!t) throw err('NO_TARIFF', 'Tarif topilmadi (seed ishga tushiring)');
  if (groupId !== null && !(await prisma.group.findUnique({ where: { id: groupId } }))) throw err('NO_GROUP', 'Guruh topilmadi');
  if (instructorId !== null) {
    const ins = await prisma.instructor.findUnique({ where: { id: instructorId } });
    if (!ins || !ins.active) throw err('NO_INSTRUCTOR', 'Instruktor topilmadi yoki faol emas');
  }
  const amount = d.initialPayment;
  if (!Number.isInteger(amount) || amount < F.MIN_REGISTRATION_PAYMENT)
    throw err('MIN_PAYMENT', `Ro'yxat uchun kamida ${F.fmt(F.MIN_REGISTRATION_PAYMENT)} to'lanishi kerak`);
  if (amount > t.total) throw err('OVERPAY', `Jami summadan oshdi: ${F.fmt(t.total)}`);

  return prisma.$transaction(async (tx) => {
    const s = await tx.student.create({
      data: {
        fullName: fullName.trim(), phone: ph1, phone2: ph2,
        selfieFileId: d.selfieFileId, passportFileId: d.passportFileId,
        category, groupId, instructorId, registeredAt,
        total: t.total, extStage1: t.extStage1, extStage2: t.extStage2, instructorShare: t.instructorShare,
        deadline: F.calcDeadline(registeredAt),
      },
    });
    const p = await tx.payment.create({
      data: { studentId: s.id, amount, note: "Ro'yxat to'lovi", createdBy: BigInt(actor), paidAt: registeredAt },
    });
    await audit(tx, actor, 'STUDENT_CREATE', 'Student', s.id, { category, total: t.total, initialPayment: amount });
    await audit(tx, actor, 'PAYMENT_CREATE', 'Payment', p.id, { studentId: s.id, amount });
    return { student: s, payment: p, calc: F.calc(s, [p]) }; // p.id = chek raqami
  });
}

// ---------- To'lov ----------
async function addPayment(actor, studentId, amount, note = null) {
  if (!Number.isInteger(amount) || amount <= 0) throw err('BAD_AMOUNT', "Summa noto'g'ri");
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    const c = F.calc(s, s.payments);
    if (amount > c.debt) throw err('OVERPAY', `Qarzdan ortiq: qarz ${F.fmt(c.debt)}`);
    const p = await tx.payment.create({ data: { studentId, amount, note, createdBy: BigInt(actor) } });
    await audit(tx, actor, 'PAYMENT_CREATE', 'Payment', p.id, { studentId, amount });
    return { payment: p, calc: F.calc(s, [...s.payments, p]) }; // p.id = chek raqami
  });
}

async function cancelPayment(actor, paymentId, reason) {
  if (!reason || !reason.trim()) throw err('NO_REASON', 'Bekor qilish sababi kerak');
  return prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!p || p.status !== 'ACTIVE') throw err('NOT_FOUND', "To'lov topilmadi yoki allaqachon bekor");
    const u = await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: BigInt(actor), cancelReason: reason },
    });
    await audit(tx, actor, 'PAYMENT_CANCEL', 'Payment', paymentId, { reason, amount: p.amount });
    return u;
  });
}

// ---------- Hujjat, chegirma, muddat ----------
async function approveDoc(actor, studentId) {
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    if (s.docApproved) throw err('ALREADY', 'Hujjat allaqachon tasdiqlangan');
    const u = await tx.student.update({ where: { id: studentId }, data: { docApproved: true, docApprovedAt: new Date() } });
    await audit(tx, actor, 'DOC_APPROVE', 'Student', studentId, null);
    return u;
  });
}

async function setDiscount(actor, studentId, amount, reason) {
  if (!Number.isInteger(amount) || amount < 0) throw err('BAD_AMOUNT', "Summa noto'g'ri");
  if (!reason || !reason.trim()) throw err('NO_REASON', 'Chegirma sababi kerak');
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    const c = F.calc({ ...s, discount: amount }, s.payments);
    if (c.rest < 0) throw err('TOO_BIG', 'Chegirma juda katta: tashqi qismdan pastga tushadi');
    if (c.net < c.paid) throw err('TOO_BIG', "Chegirma to'langan summadan kichik jami hosil qiladi");
    const u = await tx.student.update({ where: { id: studentId }, data: { discount: amount, discountReason: reason } });
    await audit(tx, actor, 'DISCOUNT_SET', 'Student', studentId, { from: s.discount, to: amount, reason });
    return u;
  });
}

async function setStartDate(actor, studentId, startDate) {
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    if (startDate < s.registeredAt && startDate.toDateString() !== s.registeredAt.toDateString())
      throw err('BAD_DATE', "Boshlanish ro'yxat sanasidan oldin bo'lmaydi");
    if (startDate > F.maxStart(s.registeredAt)) throw err('BAD_DATE', "Boshlanish ro'yxatdan 10 kundan oshmasin");
    const u = await tx.student.update({ where: { id: studentId }, data: { startDate, endDate: F.calcEnd(startDate) } });
    await audit(tx, actor, 'START_SET', 'Student', studentId, { startDate });
    return u;
  });
}

// Guruh to'lganda: guruhdagi hammaga bir sanani qo'yish
// Guruh bo'yicha: tashqariga o'tkazilishi kerak bo'lgan hamma summani bitta amalda "o'tkazildi" deb belgilaydi
async function transferGroup(actor, groupId) {
  return prisma.$transaction(async (tx) => {
    const list = await tx.student.findMany({ where: { groupId, deletedAt: null }, include: { payments: true } });
    let amount = 0, students = 0;
    for (const s of list) {
      const due = F.calc(s, s.payments).extToTransfer;
      if (due <= 0) continue;
      await tx.student.update({ where: { id: s.id }, data: { externalTransferred: { increment: due } } });
      await audit(tx, actor, 'EXT_TRANSFER', 'Student', s.id, { amount: due, group: groupId });
      amount += due; students++;
    }
    return { amount, students };
  });
}

// Guruhning to'liq hisobi
async function groupSummary(groupId) {
  const group = await prisma.group.findFirst({ where: { id: groupId } });
  if (!group) throw err('NOT_FOUND', 'Guruh topilmadi');
  const list = await prisma.student.findMany({ where: { groupId, deletedAt: null }, include: { payments: true } });
  const now = new Date();
  const r = { ...F.summarize(list), id: group.id, name: group.name, paidFull: 0, inDebt: 0, overdue: 0, noStart: 0,
    startDate: null, endDate: null, deadline: null };
  const max = (a, b) => (!a || (b && b > a) ? b : a);
  const min = (a, b) => (!a || (b && b < a) ? b : a);
  for (const s of list) {
    const c = F.calc(s, s.payments);
    if (c.debt === 0) r.paidFull++; else r.inDebt++;
    if (c.debt > 0 && s.deadline && s.deadline < now) r.overdue++;
    if (!s.startDate) r.noStart++;
    r.startDate = min(r.startDate, s.startDate);
    r.endDate = max(r.endDate, s.endDate);
    r.deadline = max(r.deadline, s.deadline);
  }
  return r;
}

async function setGroupStartDate(actor, groupId, startDate) {
  const list = await prisma.student.findMany({ where: { groupId, deletedAt: null, startDate: null }, select: { id: true } });
  const out = { ok: 0, failed: [] };
  for (const { id } of list) {
    try { await setStartDate(actor, id, startDate); out.ok++; } catch (e) { out.failed.push({ id, msg: e.message }); }
  }
  return out;
}

// ---------- Instruktor ulushi, tashqi o'tkazma ----------
async function markInstructorPaid(actor, studentId) {
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    if (s.instructorPaid) throw err('ALREADY', "Allaqachon to'langan");
    const u = await tx.student.update({ where: { id: studentId }, data: { instructorPaid: true, instructorPaidAt: new Date() } });
    await audit(tx, actor, 'INSTR_PAID', 'Student', studentId, { amount: s.instructorShare });
    return u;
  });
}

async function transferExternal(actor, studentId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw err('BAD_AMOUNT', "Summa noto'g'ri");
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    const c = F.calc(s, s.payments);
    if (amount > c.extToTransfer) throw err('OVER', `O'tkazilishi kerak: ${F.fmt(c.extToTransfer)}`);
    const u = await tx.student.update({ where: { id: studentId }, data: { externalTransferred: { increment: amount } } });
    await audit(tx, actor, 'EXT_TRANSFER', 'Student', studentId, { amount });
    return u;
  });
}

// ---------- O'chirish (soft) ----------
async function deleteStudent(actor, studentId) {
  return prisma.$transaction(async (tx) => {
    await getStudent(studentId, tx);
    await tx.student.update({ where: { id: studentId }, data: { deletedAt: new Date() } });
    await audit(tx, actor, 'STUDENT_DELETE', 'Student', studentId, null);
  });
}

// ---------- Ro'yxatlar va hisobot ----------
async function expiring(days = 7) {
  const now = new Date();
  const list = await prisma.student.findMany({
    where: { deletedAt: null, status: 'ACTIVE', deadline: { lte: F.addDays(now, days) } },
    include: { payments: true, group: true, instructor: true },
    orderBy: { deadline: 'asc' },
  });
  return list.map((s) => ({ ...s, calc: F.calc(s, s.payments), overdue: s.deadline < now }));
}

async function debtors(instructorId = null) {
  const list = await prisma.student.findMany({
    where: { deletedAt: null, status: 'ACTIVE', ...(instructorId ? { instructorId } : {}) },
    include: { payments: true },
  });
  return list.map((s) => ({ ...s, calc: F.calc(s, s.payments) })).filter((s) => s.calc.debt > 0)
    .sort((a, b) => b.calc.dueNow - a.calc.dueNow || b.calc.debt - a.calc.debt);
}

// from/to: ro'yxatga olingan sana oralig'i (kohorta). cashInPeriod: shu oraliqda tushgan pul.
async function report(from, to) {
  const students = await prisma.student.findMany({
    where: { deletedAt: null, registeredAt: { gte: from, lt: to } },
    include: { payments: true },
  });
  const cohort = F.summarize(students);
  const pay = await prisma.payment.aggregate({
    where: { status: 'ACTIVE', paidAt: { gte: from, lt: to }, student: { deletedAt: null } },
    _sum: { amount: true },
  });
  return { ...cohort, cashInPeriod: pay._sum.amount || 0 };
}

function formatReport(r) {
  return [
    `💰 Kassaga tushgan: ${F.fmt(r.cashInPeriod)}`,
    ``,
    `🏦 1-tashqi to'lov: tushgan ${F.fmt(r.ext1.paid)} / ${F.fmt(r.ext1.due)}, o'tkazilgan ${F.fmt(r.ext1.transferred)}`,
    `🏦 2-tashqi to'lov: tushgan ${F.fmt(r.ext2.paid)} / ${F.fmt(r.ext2.due)}, o'tkazilgan ${F.fmt(r.ext2.transferred)}`,
    `🏦 Jami tashqariga: kerak ${F.fmt(r.extToTransfer)}, o'tkazilgan ${F.fmt(r.extTransferred)}, qolgan ${F.fmt(r.extBalance)}`,
    `👨‍🏫 Instruktor: hisoblangan ${F.fmt(r.instrAccrued)}, to'langan ${F.fmt(r.instrPaid)}, qolgan ${F.fmt(r.instrOwed)}`,
    ``,
    `📈 Markazda qolgan: ${F.fmt(r.centerIncome)}`,
    `✅ Olingan foyda (to'langan instruktor ayirilgan): ${F.fmt(r.receivedProfit)}`,
    `🎯 Kutilgan foyda (hammasi to'lansa): ${F.fmt(r.expectedProfit)}`,
    `🔻 Chegirmalar: ${F.fmt(r.discounts)}`,
    `⚠️ Qarz: ${F.fmt(r.debt)}`,
    `👥 O'quvchilar: ${r.count}`,
  ].join('\n');
}

// ---------- Qidiruv ----------
// q: F.I.O. (qismi), telefon (qismi, +998 bilan ham bo'ladi) yoki #ID
function searchOr(q) {
  q = String(q || '').trim();
  if (q.length < 2) throw err('SHORT_QUERY', 'Kamida 2 ta belgi yozing');
  const OR = [];
  const onlyPhoneChars = /^[\d\s+\-()]+$/.test(q);
  const dg = q.replace(/\D/g, '');
  if (/^#\d+$/.test(q)) OR.push({ id: parseInt(q.slice(1), 10) });
  else if (onlyPhoneChars && dg.length >= 4) {
    const tail = dg.length > 9 ? dg.slice(-9) : dg;
    OR.push({ phone: { contains: tail } }, { phone2: { contains: tail } });
  } else OR.push({ fullName: { contains: q, mode: 'insensitive' } });
  return OR;
}

async function searchStudents(q, { instructorId = null, limit = 10 } = {}) {
  const OR = searchOr(q);
  return prisma.student.findMany({
    where: { deletedAt: null, ...(instructorId ? { instructorId } : {}), OR },
    include: { payments: true, group: true, instructor: true },
    orderBy: { fullName: 'asc' },
    take: limit,
  });
}

// Web ilova uchun ro'yxat: filter = all | grouped | ungrouped | debtors
async function listStudents({ q = '', filter = 'all', groupId = null, instructorId = null, limit = 300 } = {}) {
  const where = { deletedAt: null, status: 'ACTIVE' };
  if (instructorId) where.instructorId = instructorId;
  if (filter === 'ungrouped') where.groupId = null;
  if (groupId) where.groupId = groupId;
  if (q && String(q).trim().length >= 2) where.OR = searchOr(q);
  let list = await prisma.student.findMany({
    where, include: { payments: true, group: true, instructor: true }, orderBy: { registeredAt: 'desc' },
  });
  if (filter === 'grouped') list = list.filter((s) => s.groupId !== null);
  if (filter === 'debtors') list = list.filter((s) => F.calc(s, s.payments).debt > 0);
  return list.slice(0, limit);
}

async function getStudentCard(id) {
  return prisma.student.findFirst({ where: { id, deletedAt: null }, include: { payments: true, group: true, instructor: true } });
}

// ---------- Instruktor ----------
async function addInstructor(actor, telegramId, name) {
  if (!name || name.trim().length < 2) throw err('BAD_NAME', 'Ism kerak');
  const tid = BigInt(telegramId);
  const ex = await prisma.instructor.findUnique({ where: { telegramId: tid } });
  return prisma.$transaction(async (tx) => {
    const ins = ex
      ? await tx.instructor.update({ where: { id: ex.id }, data: { name: name.trim(), active: true } })
      : await tx.instructor.create({ data: { telegramId: tid, name: name.trim() } });
    await audit(tx, actor, ex ? 'INSTR_REACTIVATE' : 'INSTR_CREATE', 'Instructor', ins.id, { telegramId: String(telegramId) });
    return ins;
  });
}

const listInstructors = () => prisma.instructor.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
const getInstructorByTelegramId = (tid) => prisma.instructor.findUnique({ where: { telegramId: BigInt(tid) } });

// instructorId = null -> biriktirishni olib tashlash
async function assignInstructor(actor, studentId, instructorId) {
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    if (instructorId !== null) {
      const ins = await tx.instructor.findUnique({ where: { id: instructorId } });
      if (!ins || !ins.active) throw err('NO_INSTRUCTOR', 'Instruktor topilmadi yoki faol emas');
    }
    const u = await tx.student.update({ where: { id: studentId }, data: { instructorId }, include: { instructor: true } });
    await audit(tx, actor, 'INSTR_ASSIGN', 'Student', studentId, { from: s.instructorId, to: instructorId });
    return u;
  });
}

// ---------- Guruhlar ----------
async function createGroup(actor, name) {
  name = String(name || '').trim();
  if (name.length < 2) throw err('BAD_NAME', 'Guruh nomi kerak');
  try {
    return await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({ data: { name } });
      await audit(tx, actor, 'GROUP_CREATE', 'Group', g.id, { name });
      return g;
    });
  } catch (e) {
    if (e.code === 'P2002') throw err('DUP_GROUP', 'Bunday guruh bor');
    throw e;
  }
}

const listGroups = () => prisma.group.findMany({
  orderBy: { name: 'asc' },
  include: { _count: { select: { students: { where: { deletedAt: null } } } } },
});

async function assignGroup(actor, studentId, groupId) {
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(studentId, tx);
    if (groupId !== null) {
      const g = await tx.group.findUnique({ where: { id: groupId } });
      if (!g) throw err('NO_GROUP', 'Guruh topilmadi');
    }
    const u = await tx.student.update({ where: { id: studentId }, data: { groupId }, include: { group: true } });
    await audit(tx, actor, 'GROUP_ASSIGN', 'Student', studentId, { from: s.groupId, to: groupId });
    return u;
  });
}

const listGroupStudents = (groupId) => prisma.student.findMany({
  where: { groupId, deletedAt: null }, include: { payments: true, instructor: true }, orderBy: { fullName: 'asc' },
});

const listByInstructor = (instructorId) => prisma.student.findMany({
  where: { instructorId, deletedAt: null, status: 'ACTIVE' }, include: { payments: true }, orderBy: { fullName: 'asc' },
});

async function instructorSummary() {
  const list = await prisma.instructor.findMany({
    where: { active: true }, orderBy: { name: 'asc' },
    include: { students: { where: { deletedAt: null }, select: { instructorShare: true, instructorPaid: true } } },
  });
  return list.map((i) => {
    const accrued = i.students.reduce((a, s) => a + s.instructorShare, 0);
    const paid = i.students.filter((s) => s.instructorPaid).reduce((a, s) => a + s.instructorShare, 0);
    return { id: i.id, name: i.name, telegramId: i.telegramId, count: i.students.length, accrued, paid, unpaid: accrued - paid };
  });
}

async function getPaymentFull(id) {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p) return null;
  const student = await prisma.student.findFirst({ where: { id: p.studentId, deletedAt: null }, include: { payments: true } });
  return student ? { payment: p, student } : null;
}

const listUngrouped = () => prisma.student.findMany({
  where: { deletedAt: null, status: 'ACTIVE', groupId: null },
  include: { payments: true },
  orderBy: { registeredAt: 'desc' },
});

// Bir nechta o'quvchini bitta guruhga biriktirish (2 ta so'rov, tezkor)
async function assignGroupMany(actor, studentIds, groupId) {
  if (!studentIds.length) throw err('EMPTY', "O'quvchi tanlanmadi");
  return prisma.$transaction(async (tx) => {
    const g = await tx.group.findUnique({ where: { id: groupId } });
    if (!g) throw err('NO_GROUP', 'Guruh topilmadi');
    const r = await tx.student.updateMany({ where: { id: { in: studentIds }, deletedAt: null }, data: { groupId } });
    await tx.auditLog.createMany({
      data: studentIds.map((id) => ({ actorId: BigInt(actor), action: 'GROUP_ASSIGN', entity: 'Student', entityId: id, data: { to: groupId } })),
    });
    return { group: g, count: r.count };
  });
}

// ---------- Tahrirlash ----------
const CATEGORIES = ['B', 'BC', 'C', 'E'];
const listTariffs = () => prisma.tariff.findMany({ orderBy: { category: 'asc' } });

// patch: { fullName?, phone?, phone2?, category? }. Toifa o'zgarsa, tarif qayta qotadi (joriy tarif jadvalidan).
async function updateStudent(actor, id, patch = {}) {
  return prisma.$transaction(async (tx) => {
    const s = await getStudent(id, tx);
    const data = {};
    const changes = {};

    if (patch.fullName !== undefined) {
      const n = String(patch.fullName).trim();
      if (n.length < 5) throw err('BAD_NAME', "F.I.O. to'liq emas");
      if (n !== s.fullName) { data.fullName = n; changes.fullName = [s.fullName, n]; }
    }

    if (patch.phone !== undefined || patch.phone2 !== undefined) {
      const ph1 = patch.phone !== undefined ? normPhone(patch.phone) : s.phone;
      const ph2 = patch.phone2 !== undefined ? normPhone(patch.phone2 || '') : (s.phone2 || '');
      if (ph1.length < 9) throw err('BAD_PHONE', "Asosiy telefon noto'g'ri");
      if (ph2.length < 9) throw err('BAD_PHONE2', "Qo'shimcha telefon noto'g'ri");
      if (ph1 === ph2) throw err('SAME_PHONE', "Ikkita telefon har xil bo'lishi kerak");
      if (ph1 !== s.phone || ph2 !== s.phone2) {
        const clash = (await tx.student.findMany({
          where: { deletedAt: null, OR: [{ phone: { in: [ph1, ph2] } }, { phone2: { in: [ph1, ph2] } }] },
        })).find((x) => x.id !== s.id);
        if (clash) throw err('DUPLICATE_PHONE', `Bu telefon allaqachon bor: ${clash.fullName} (#${clash.id})`);
        if (ph1 !== s.phone) { data.phone = ph1; changes.phone = [s.phone, ph1]; }
        if (ph2 !== s.phone2) { data.phone2 = ph2; changes.phone2 = [s.phone2, ph2]; }
      }
    }

    if (patch.category !== undefined && patch.category !== s.category) {
      if (!CATEGORIES.includes(patch.category)) throw err('BAD_CATEGORY', "Toifa noto'g'ri");
      if (s.instructorPaid) throw err('LOCKED', "Instruktor ulushi to'langan, toifani o'zgartirib bo'lmaydi");
      const t = await tx.tariff.findUnique({ where: { category: patch.category } });
      if (!t) throw err('NO_TARIFF', 'Tarif topilmadi');
      const next = { ...s, total: t.total, extStage1: t.extStage1, extStage2: t.extStage2, instructorShare: t.instructorShare };
      const c = F.calc(next, s.payments);
      if (c.rest < 0 || c.net < c.paid) throw err('TOO_BIG', "Yangi toifa tarifi to'langan summa yoki chegirmaga sig'maydi");
      if (s.externalTransferred > c.extReceived) throw err('LOCKED', "Tashqariga o'tkazilgan summa yangi tarifdan katta");
      Object.assign(data, { category: patch.category, total: t.total, extStage1: t.extStage1, extStage2: t.extStage2, instructorShare: t.instructorShare });
      changes.category = [s.category, patch.category];
    }

    if (!Object.keys(data).length) throw err('NO_CHANGE', "O'zgarish yo'q");
    const u = await tx.student.update({ where: { id }, data });
    await audit(tx, actor, 'STUDENT_EDIT', 'Student', id, changes);
    return u;
  });
}

module.exports = {
  prisma, getPaymentFull, updateStudent, listTariffs, registerStudent, addPayment, cancelPayment, approveDoc, setDiscount, setStartDate,
  setGroupStartDate, searchStudents, getStudentCard, addInstructor, listInstructors,
  getInstructorByTelegramId, assignInstructor, createGroup, listGroups, assignGroup,
  listGroupStudents, transferGroup, groupSummary, listStudents, listUngrouped, assignGroupMany, listByInstructor, instructorSummary, markInstructorPaid, transferExternal, deleteStudent, expiring, debtors, report, formatReport,
};