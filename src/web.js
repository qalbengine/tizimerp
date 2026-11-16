'use strict';
// Telegram Mini App uchun API + statik frontend (web/dist).
// Kirish: Telegram initData serverda BOT_TOKEN bilan tekshiriladi, rol ID bo'yicha aniqlanadi.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const S = require('./services');
const F = require('./finance');
const R = require('./receiptPdf');

const ADMIN_IDS = () => (process.env.ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);

// ---- Telegram initData tekshiruvi ----
function verifyInitData(initData, token, maxAgeSec = 86400) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  const a = Buffer.from(calc, 'hex'); const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(params.get('auth_date') || 0);
  if (!(age >= 0 && age <= maxAgeSec)) return null;
  try { return JSON.parse(params.get('user')); } catch { return null; }
}

const err = (code, msg) => Object.assign(new Error(msg), { code });
const int = (v, name = 'qiymat') => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw err('BAD_INPUT', `${name} noto'g'ri`);
  return n;
};
// "YYYY-MM-DD" -> mahalliy Date
function ymd(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw err('BAD_DATE', "Sana formati noto'g'ri");
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getMonth() !== +m[2] - 1) throw err('BAD_DATE', "Sana noto'g'ri");
  return d;
}

// ---- Rasm yuklash (base64 -> Telegram file_id) ----
const PHOTO_MAX = 5 * 1024 * 1024;
function decodeImage(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw err('BAD_IMAGE', "Rasm formati noto'g'ri");
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.length > PHOTO_MAX) throw err('BAD_IMAGE', "Rasm hajmi noto'g'ri (ko'pi bilan 5 MB)");
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!jpeg && !png) throw err('BAD_IMAGE', 'Fayl rasm emas');
  return buf;
}
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));

// ---- DTO ----
function studentDto(s, role, { light = false } = {}) {
  const c = F.calc(s, s.payments || []);
  const d = {
    id: s.id, fullName: s.fullName, category: s.category, status: s.status,
    registeredAt: s.registeredAt, startDate: s.startDate, endDate: s.endDate, deadline: s.deadline,
    docApproved: s.docApproved, discount: s.discount, discountReason: s.discountReason,
    total: s.total, net: c.net, paid: c.paid, debt: c.debt, dueNow: c.dueNow,
    stage1: c.stage1, stage2: c.stage2, restPart: c.restPart,
    group: s.group ? { id: s.group.id, name: s.group.name } : null,
    instructor: s.instructor ? { id: s.instructor.id, name: s.instructor.name } : null,
  };
  if (role === 'admin') {
    Object.assign(d, {
      phone: s.phone, phone2: s.phone2, instructorShare: s.instructorShare, instructorPaid: s.instructorPaid,
      extToTransfer: c.extToTransfer, extTransferred: s.externalTransferred, expectedProfit: c.expectedProfit,
      hasPhotos: !!(s.selfieFileId || s.passportFileId),
    });
  }
  if (!light) {
    d.payments = [...(s.payments || [])].sort((a, b) => b.id - a.id).map((p) => ({
      id: p.id, amount: p.amount, paidAt: p.paidAt, status: p.status, note: p.note, cancelReason: p.cancelReason,
    }));
  }
  return d;
}

function createWeb(bot) {
  const app = express();
  app.disable('x-powered-by');
  app.set('json replacer', (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  const smallJson = express.json({ limit: '50kb' });
  app.use((req, res, next) => (req.path === '/api/uploads/photo' ? next() : smallJson(req, res, next)));
  if (process.env.WEB_DEV === '1') console.warn('DIQQAT: WEB_DEV=1 (faqat lokal sinov uchun!)');

  // Railway healthcheck uchun (autentifikatsiyasiz, hech narsa oshkor qilmaydi)
  app.get('/health', (req, res) => res.json({ ok: true }));

  const api = express.Router();
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---- Kirish ----
  api.use(h(async (req, res, next) => {
    let user = null;
    if (process.env.WEB_DEV === '1' && req.get('x-dev-user')) user = { id: Number(req.get('x-dev-user')), first_name: 'dev' };
    else {
      const m = (req.get('authorization') || '').match(/^tma (.+)$/);
      if (m) user = verifyInitData(m[1], process.env.BOT_TOKEN);
    }
    if (!user || !user.id) return res.status(401).json({ error: 'Telegram orqali kiring' });
    let role = null; let instructor = null;
    if (ADMIN_IDS().includes(String(user.id))) role = 'admin';
    else {
      const ins = await S.getInstructorByTelegramId(user.id);
      if (ins && ins.active) { role = 'instructor'; instructor = ins; }
    }
    if (!role) return res.status(403).json({ error: "Ruxsat yo'q" });
    req.me = { id: user.id, name: user.first_name || '', role, instructor };
    return next();
  }));

  const adminOnly = (req, res, next) => (req.me.role === 'admin' ? next() : res.status(403).json({ error: "Ruxsat yo'q" }));
  const iid = (req) => (req.me.role === 'instructor' ? req.me.instructor.id : null);

  async function loadStudent(req) {
    const s = await S.getStudentCard(int(req.params.id, 'ID'));
    if (!s || (iid(req) && s.instructorId !== iid(req))) throw err('NOT_FOUND', 'Topilmadi');
    return s;
  }

  api.get('/me', (req, res) => res.json({ id: req.me.id, name: req.me.name, role: req.me.role, instructor: req.me.instructor ? req.me.instructor.name : null }));

  // ---- O'quvchilar ----
  api.get('/students', h(async (req, res) => {
    const list = await S.listStudents({
      q: req.query.q || '', filter: String(req.query.filter || 'all'),
      groupId: req.query.groupId ? int(req.query.groupId) : null, instructorId: iid(req),
    });
    res.json(list.map((s) => studentDto(s, req.me.role, { light: true })));
  }));

  api.post('/students/assign-group', adminOnly, h(async (req, res) => {
    const ids = (req.body.ids || []).map((x) => int(x, 'ID'));
    const r = await S.assignGroupMany(req.me.id, ids, int(req.body.groupId, 'Guruh'));
    res.json({ count: r.count, group: r.group.name });
  }));

  api.get('/students/:id', h(async (req, res) => res.json(studentDto(await loadStudent(req), req.me.role))));

  const act = (fn) => [adminOnly, h(async (req, res) => { await fn(req); res.json({ ok: true }); })];
  const sid = (req) => int(req.params.id, 'ID');

  api.post('/students/:id/payments', ...act((req) => S.addPayment(req.me.id, sid(req), int(req.body.amount, 'Summa'), req.body.note || null)));
  api.post('/students/:id/doc-approve', ...act((req) => S.approveDoc(req.me.id, sid(req))));
  api.post('/students/:id/discount', ...act((req) => S.setDiscount(req.me.id, sid(req), int(req.body.amount, 'Summa'), String(req.body.reason || ''))));
  api.post('/students/:id/start-date', ...act((req) => S.setStartDate(req.me.id, sid(req), ymd(req.body.date))));
  api.post('/students/:id/transfer', ...act((req) => S.transferExternal(req.me.id, sid(req), int(req.body.amount, 'Summa'))));
  api.post('/students/:id/instructor-paid', ...act(async (req) => {
    const s = await S.getStudentCard(sid(req));
    if (!s) throw err('NOT_FOUND', 'Topilmadi');
    if (!s.instructorId) throw err('NO_INSTRUCTOR', 'Avval instruktor biriktiring');
    await S.markInstructorPaid(req.me.id, s.id);
  }));
  api.post('/students/:id/assign-instructor', ...act((req) =>
    S.assignInstructor(req.me.id, sid(req), req.body.instructorId == null ? null : int(req.body.instructorId, 'Instruktor'))));
  api.post('/students/:id/assign-group', ...act((req) =>
    S.assignGroup(req.me.id, sid(req), req.body.groupId == null ? null : int(req.body.groupId, 'Guruh'))));
  api.delete('/students/:id', ...act((req) => S.deleteStudent(req.me.id, sid(req))));

  // ---- Ro'yxatga olish, tahrirlash, tariflar, rasm yuklash ----
  api.get('/tariffs', adminOnly, h(async (req, res) => {
    res.json({ minPayment: F.MIN_REGISTRATION_PAYMENT, tariffs: await S.listTariffs() });
  }));

  // Rasm Telegram'ga yuboriladi (ARCHIVE_CHAT_ID yoki adminning o'z chati), qaytgan file_id saqlanadi
  api.post('/uploads/photo', adminOnly, express.json({ limit: '8mb' }), h(async (req, res) => {
    const kind = req.body && req.body.kind;
    if (kind !== 'selfie' && kind !== 'passport') throw err('BAD_INPUT', "Rasm turi noto'g'ri");
    const buf = decodeImage(req.body.data);
    const chat = process.env.ARCHIVE_CHAT_ID || req.me.id;
    const caption = `${kind === 'selfie' ? 'Selfi' : 'Pasport'} (ilovadan yuklandi)`;
    let msg;
    try {
      msg = await bot.telegram.sendPhoto(chat, { source: buf }, { caption });
    } catch (e) {
      const why = (e && (e.description || e.message)) || 'noma\'lum xato';
      console.error('Rasm yuklash xatosi (chat:', chat, '):', why);
      throw err('UPLOAD_FAILED', `Telegram rasmni qabul qilmadi: ${why}`);
    }
    const photos = (msg && msg.photo) || [];
    if (!photos.length) throw err('UPLOAD_FAILED', 'Rasm saqlanmadi');
    res.json({ fileId: photos[photos.length - 1].file_id });
  }));

  api.post('/students', adminOnly, h(async (req, res) => {
    const b = req.body || {};
    const r = await S.registerStudent(req.me.id, {
      fullName: b.fullName, phone: b.phone, phone2: b.phone2, category: b.category,
      groupId: b.groupId == null ? null : int(b.groupId, 'Guruh'),
      instructorId: b.instructorId == null ? null : int(b.instructorId, 'Instruktor'),
      selfieFileId: b.selfieFileId, passportFileId: b.passportFileId,
      initialPayment: int(b.initialPayment, "To'lov"),
    });
    res.json({ id: r.student.id, fullName: r.student.fullName, paymentId: r.payment.id, debt: r.calc.debt, deadline: r.student.deadline });
  }));

  api.patch('/students/:id', ...act((req) =>
    S.updateStudent(req.me.id, sid(req), pick(req.body, ['fullName', 'phone', 'phone2', 'category']))));

  api.post('/students/:id/send-photos', adminOnly, h(async (req, res) => {
    const s = await S.getStudentCard(sid(req));
    if (!s) throw err('NOT_FOUND', 'Topilmadi');
    if (!s.selfieFileId && !s.passportFileId) throw err('NO_PHOTO', "Rasm yo'q");
    if (s.selfieFileId) await bot.telegram.sendPhoto(req.me.id, s.selfieFileId, { caption: `Selfi: ${s.fullName}` });
    if (s.passportFileId) await bot.telegram.sendPhoto(req.me.id, s.passportFileId, { caption: `Pasport: ${s.fullName}` });
    res.json({ ok: true });
  }));

  // ---- To'lovlar, chek ----
  api.post('/payments/:id/cancel', ...act((req) => S.cancelPayment(req.me.id, int(req.params.id, 'Chek'), String(req.body.reason || ''))));

  api.post('/payments/:id/send-receipt', h(async (req, res) => {
    const full = await S.getPaymentFull(int(req.params.id, 'Chek'));
    if (!full || (iid(req) && full.student.instructorId !== iid(req))) throw err('NOT_FOUND', 'Topilmadi');
    const source = await R.buildReceiptPdf({ student: full.student, payment: full.payment, calc: R.calcAsOf(full.student, full.payment) });
    await bot.telegram.sendDocument(req.me.id, { source, filename: `chek-${full.payment.id}.pdf` }, { caption: `Chek №${full.payment.id}` });
    res.json({ ok: true });
  }));

  // ---- Ro'yxatlar ----
  api.get('/debtors', h(async (req, res) => {
    const list = await S.debtors(iid(req));
    res.json(list.map((s) => studentDto(s, req.me.role, { light: true })));
  }));

  api.get('/expiring', adminOnly, h(async (req, res) => {
    const list = await S.expiring(int(req.query.days || 7, 'Kun'));
    res.json(list.map((s) => ({ ...studentDto(s, req.me.role, { light: true }), overdue: s.overdue })));
  }));

  // ---- Hisobot ----
  api.get('/report', adminOnly, h(async (req, res) => {
    const now = new Date();
    const p = String(req.query.period || 'month');
    let from; let to;
    if (p === 'today') { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); to = F.addDays(from, 1); }
    else if (p === 'all') { from = new Date(2000, 0, 1); to = new Date(2100, 0, 1); }
    else { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 1); }
    res.json(await S.report(from, to));
  }));

  // ---- Guruhlar ----
  api.get('/groups', h(async (req, res) => {
    const list = await S.listGroups();
    res.json(list.map((g) => ({ id: g.id, name: g.name, count: g._count.students })));
  }));
  api.post('/groups', adminOnly, h(async (req, res) => {
    const g = await S.createGroup(req.me.id, String(req.body.name || ''));
    res.json({ id: g.id, name: g.name });
  }));
  api.get('/groups/:id/students', adminOnly, h(async (req, res) => {
    const list = await S.listGroupStudents(int(req.params.id, 'Guruh'));
    res.json(list.map((s) => studentDto(s, req.me.role, { light: true })));
  }));
  api.get('/groups/:id/summary', adminOnly, h(async (req, res) => res.json(await S.groupSummary(int(req.params.id, 'Guruh')))));
  api.post('/groups/:id/transfer', adminOnly, h(async (req, res) => res.json(await S.transferGroup(req.me.id, int(req.params.id, 'Guruh')))));
  api.post('/groups/:id/start-date', adminOnly, h(async (req, res) => {
    res.json(await S.setGroupStartDate(req.me.id, int(req.params.id, 'Guruh'), ymd(req.body.date)));
  }));

  // ---- Instruktorlar ----
  api.get('/instructors', adminOnly, h(async (req, res) => res.json(await S.instructorSummary())));
  api.post('/instructors', adminOnly, h(async (req, res) => {
    const tid = String(req.body.telegramId || '').trim();
    if (!/^\d{5,15}$/.test(tid)) throw err('BAD_INPUT', "Telegram ID noto'g'ri");
    const i = await S.addInstructor(req.me.id, tid, String(req.body.name || ''));
    res.json({ id: i.id, name: i.name });
  }));

  api.use((req, res) => res.status(404).json({ error: 'Topilmadi' }));
  app.use('/api', api);

  // ---- Frontend (web/dist) ----
  const dist = path.join(__dirname, '..', 'web', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => {
    const index = path.join(dist, 'index.html');
    if (fs.existsSync(index)) return res.sendFile(index);
    return res.status(404).send('Web ilova qurilmagan: "npm run build" ni ishga tushiring');
  });

  // ---- Xatolar ----
  // eslint-disable-next-line no-unused-vars
  app.use((e, req, res, next) => {
    const c = e && e.code;
    const known = typeof c === 'string' && /^[A-Z][A-Z_0-9]+$/.test(c);
    const status = c === 'NOT_FOUND' ? 404 : known ? 400 : 500;
    if (status === 500) console.error('API xatosi:', e);
    res.status(status).json({ error: status === 500 ? 'Ichki xato' : e.message });
  });

  return app;
}

module.exports = { createWeb, verifyInitData };