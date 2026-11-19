const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { db } = require('./fakePrisma'); // soxta baza (Prisma o'rniga)

process.env.BOT_TOKEN = '123:TEST';
process.env.ADMIN_IDS = '111';
process.env.WEB_DEV = '1';
process.env.TZ = 'Asia/Tashkent';

const S = require('../src/services');
const { createWeb, verifyInitData } = require('../src/web');

const sent = [];
const bot = { telegram: { sendDocument: async (...a) => sent.push(['doc', ...a]), sendPhoto: async (...a) => sent.push(['photo', ...a]) } };
let server; let base;
test.before(async () => {
  server = createWeb(bot).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(user, method, path, body) {
  const r = await fetch(base + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { 'x-dev-user': String(user) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const A = 111; const I = 222222; const X = 999;
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

test('initData tekshiruvi', () => {
  const make = (token, authDate) => {
    const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAA', user: JSON.stringify({ id: 111, first_name: 'Asad' }) });
    const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
    return params.toString();
  };
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyInitData(make('123:TEST', now), '123:TEST').id, 111);
  assert.equal(verifyInitData(make('123:TEST', now), '999:OTHER'), null, 'boshqa token bilan rad');
  assert.equal(verifyInitData(make('123:TEST', now - 90000), '123:TEST'), null, 'eskirgan');
  assert.equal(verifyInitData(make('123:TEST', now).replace('Asad', 'Hack'), '123:TEST'), null, 'o\'zgartirilgan');
});

test('kirish: tokensiz 401, begona 403', async () => {
  assert.equal((await call(null, 'GET', '/me')).status, 401);
  assert.equal((await call(X, 'GET', '/me')).status, 403);
  const me = await call(A, 'GET', '/me');
  assert.equal(me.status, 200); assert.equal(me.body.role, 'admin');
});

test('admin oqimi: ro\'yxat, to\'lov, bekor, hujjat, chegirma, sana', async () => {
  const r = await S.registerStudent(A, { fullName: 'Karimov Aziz Test', phone: '901112233', phone2: '907776655', category: 'B', selfieFileId: 'S', passportFileId: 'P', initialPayment: 1_000_000 });
  const id = r.student.id;
  const list = await call(A, 'GET', '/students');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].phone, '901112233');
  assert.equal(list.body[0].payments, undefined, 'ro\'yxatda to\'lovlar yo\'q (yengil)');

  assert.equal((await call(A, 'GET', '/students?q=karim')).body.length, 1);
  assert.equal((await call(A, 'GET', '/students?q=zzzz')).body.length, 0);
  assert.equal((await call(A, 'GET', '/students?filter=ungrouped')).body.length, 1);

  const over = await call(A, 'POST', `/students/${id}/payments`, { amount: 99_000_000 });
  assert.equal(over.status, 400); assert.match(over.body.error, /Qarzdan ortiq/);
  assert.equal((await call(A, 'POST', `/students/${id}/payments`, { amount: 1_500_000 })).status, 200);
  assert.equal((await call(A, 'POST', `/students/${id}/doc-approve`)).status, 200);
  assert.equal((await call(A, 'POST', `/students/${id}/discount`, { amount: 500000, reason: '' })).status, 400, 'sababsiz chegirma rad');
  assert.equal((await call(A, 'POST', `/students/${id}/discount`, { amount: 500000, reason: 'Aksiya' })).status, 200);
  assert.equal((await call(A, 'POST', `/students/${id}/start-date`, { date: today() })).status, 200);
  assert.equal((await call(A, 'POST', `/students/${id}/start-date`, { date: 'xato' })).status, 400);

  const card = await call(A, 'GET', `/students/${id}`);
  assert.equal(card.body.net, 5_000_000);
  assert.equal(card.body.paid, 2_500_000);
  assert.equal(card.body.payments.length, 2);
  assert.ok(card.body.endDate, 'tugash sanasi hisoblandi');

  const pid = card.body.payments[0].id;
  assert.equal((await call(A, 'POST', `/payments/${pid}/cancel`, { reason: '' })).status, 400);
  assert.equal((await call(A, 'POST', `/payments/${pid}/cancel`, { reason: 'Xato' })).status, 200);
  assert.equal((await call(A, 'GET', `/students/${id}`)).body.paid, 1_000_000);

  assert.equal((await call(A, 'POST', `/payments/${pid}/send-receipt`)).status, 200);
  assert.equal(sent.filter((x) => x[0] === 'doc').length, 1, 'PDF chek botga yuborildi');
  assert.equal((await call(A, 'POST', `/students/${id}/send-photos`)).status, 200);
  assert.equal(sent.filter((x) => x[0] === 'photo').length, 2, 'selfi va pasport yuborildi');
});

test('guruhlar: yaratish va ommaviy biriktirish', async () => {
  const b = await S.registerStudent(A, { fullName: 'Sodiqov Sodiq Test', phone: '900000021', phone2: '900000022', category: 'B', selfieFileId: 'S', passportFileId: 'P', initialPayment: 1_000_000 });
  const g = await call(A, 'POST', '/groups', { name: 'B-1 dekabr' });
  assert.equal(g.status, 200);
  const un = await call(A, 'GET', '/students?filter=ungrouped');
  assert.equal(un.body.length, 2);
  const as = await call(A, 'POST', '/students/assign-group', { ids: un.body.map((s) => s.id), groupId: g.body.id });
  assert.equal(as.body.count, 2);
  assert.equal((await call(A, 'GET', '/students?filter=ungrouped')).body.length, 0);
  assert.equal((await call(A, 'GET', '/students?filter=grouped')).body.length, 2);
  assert.equal((await call(A, 'GET', '/groups')).body[0].count, 2);
  assert.equal((await call(A, 'GET', `/groups/${g.body.id}/students`)).body.length, 2);
  assert.equal((await call(A, 'POST', `/groups/${g.body.id}/start-date`, { date: today() })).status, 200);
  const gs = await call(A, 'GET', `/groups/${g.body.id}/summary`);
  assert.equal(gs.status, 200);
  assert.equal(gs.body.count, 2);
  assert.equal(gs.body.paidFull + gs.body.inDebt, 2);
  assert.ok(gs.body.endDate);
  const need = gs.body.extBalance;
  const tr = await call(A, 'POST', `/groups/${g.body.id}/transfer`);
  assert.equal(tr.body.amount, need);
  assert.equal((await call(A, 'GET', `/groups/${g.body.id}/summary`)).body.extBalance, 0);
  const before = sent.length;
  const ex = await call(A, 'POST', '/students/export', { ids: gs.body.count ? un.body.map((s) => s.id) : [] });
  assert.equal(ex.status, 200); assert.equal(ex.body.count, 2);
  const docMsg = sent.slice(before).find((m) => m[0] === 'doc');
  assert.ok(docMsg, 'CSV hujjat yuborildi');
  const csv = docMsg[2].source.toString('utf8');
  assert.ok(csv.startsWith('\uFEFFID;F.I.O.;'), 'BOM + sarlavha'); assert.equal(csv.split('\r\n').length, 3);
  assert.equal((await call(I, 'POST', '/students/export', { ids: [1] })).status, 403);
  assert.equal((await call(A, 'POST', '/students/export', { ids: [] })).status, 400);
  assert.equal((await call(A, 'POST', `/groups/${g.body.id}/transfer`)).body.amount, 0, 'ikkinchi marta 0');
  assert.equal((await call(I, 'GET', `/groups/${g.body.id}/summary`)).status, 403);
  assert.ok(b.student.id);
});

test('instruktor: faqat o\'z o\'quvchilari, o\'zgartira olmaydi', async () => {
  assert.equal((await call(A, 'POST', '/instructors', { telegramId: '222222', name: 'Kadir' })).status, 200);
  const all = (await call(A, 'GET', '/students')).body;
  const mine = all[0].id; const other = all[1].id;
  assert.equal((await call(A, 'POST', `/students/${mine}/assign-instructor`, { instructorId: 1 })).status, 200);

  const list = await call(I, 'GET', '/students');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, mine);
  assert.equal(list.body[0].phone, undefined, 'instruktor telefonni ko\'rmaydi');
  assert.equal(list.body[0].instructorShare, undefined);
  assert.equal((await call(I, 'GET', `/students/${other}`)).status, 404, 'begona o\'quvchi yopiq');
  assert.equal((await call(I, 'GET', `/students/${mine}`)).status, 200);
  assert.equal((await call(I, 'POST', `/students/${mine}/payments`, { amount: 1000 })).status, 403);
  assert.equal((await call(I, 'DELETE', `/students/${mine}`)).status, 403);
  assert.equal((await call(I, 'GET', '/report')).status, 403);
  assert.equal((await call(I, 'GET', '/instructors')).status, 403);
  assert.equal((await call(I, 'POST', `/students/${mine}/send-photos`)).status, 403);
  assert.equal((await call(I, 'GET', '/debtors')).body.every((s) => s.id === mine), true);

  const pid = (await call(I, 'GET', `/students/${mine}`)).body.payments[0].id;
  assert.equal((await call(I, 'POST', `/payments/${pid}/send-receipt`)).status, 200, 'instruktor o\'z chekini oladi');
  const otherPay = (await call(A, 'GET', `/students/${other}`)).body.payments[0].id;
  assert.equal((await call(I, 'POST', `/payments/${otherPay}/send-receipt`)).status, 404);
});

test('ro\'yxatlar va hisobot (admin)', async () => {
  assert.ok(Array.isArray((await call(A, 'GET', '/debtors')).body));
  assert.ok(Array.isArray((await call(A, 'GET', '/expiring?days=90')).body));
  const rep = await call(A, 'GET', '/report?period=all');
  assert.equal(rep.status, 200);
  assert.ok(rep.body.cashIn > 0 && 'expectedProfit' in rep.body);
  const ins = await call(A, 'GET', '/instructors');
  assert.equal(ins.body[0].name, 'Kadir');
  assert.equal(typeof ins.body[0].telegramId, 'string', 'BigInt matn ko\'rinishida');
});

test('healthcheck autentifikatsiyasiz ishlaydi', async () => {
  const r = await fetch(base + '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

// ---------- v2: ro'yxatga olish, tahrirlash, rasm yuklash ----------
const jpegDataUrl = () => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');
bot.telegram.sendPhoto = async (chat, file, extra) => {
  if (typeof file === 'string') { sent.push(['photo', chat, file]); return {}; }       // file_id bilan yuborish
  if (chat === 'bad-chat') { const e = new Error('400'); e.description = 'Bad Request: chat not found'; throw e; }
  sent.push(['upload', chat, extra.caption]);                                           // yangi rasm yuklash
  return { photo: [{ file_id: 'small' }, { file_id: 'BIG_' + sent.length }] };
};

test('rasm yuklash: file_id qaytadi, noto\'g\'ri fayl rad etiladi', async () => {
  const ok = await call(A, 'POST', '/uploads/photo', { kind: 'selfie', data: jpegDataUrl() });
  assert.equal(ok.status, 200);
  assert.match(ok.body.fileId, /^BIG_/, 'eng katta o\'lchamdagi file_id');
  const up = sent.filter((x) => x[0] === 'upload').at(-1);
  assert.equal(up[1], A, 'ARCHIVE_CHAT_ID yo\'q bo\'lsa, adminning o\'z chatiga');
  assert.equal((await call(A, 'POST', '/uploads/photo', { kind: 'selfie', data: 'data:text/html;base64,PGI+' })).status, 400);
  assert.equal((await call(A, 'POST', '/uploads/photo', { kind: 'selfie', data: 'data:image/jpeg;base64,' + Buffer.alloc(300, 1).toString('base64') })).status, 400, 'JPEG belgisi yo\'q');
  assert.equal((await call(A, 'POST', '/uploads/photo', { kind: 'boshqa', data: jpegDataUrl() })).status, 400);
  assert.equal((await call(I, 'POST', '/uploads/photo', { kind: 'selfie', data: jpegDataUrl() })).status, 403, 'instruktor yuklay olmaydi');
});

test('ilovadan ro\'yxatga olish', async () => {
  const t = await call(A, 'GET', '/tariffs');
  assert.equal(t.body.minPayment, 1_000_000);
  assert.ok(t.body.tariffs.find((x) => x.category === 'BC'));

  const form = { fullName: 'Yangi Talaba Test', phone: '+998 91 000 11 22', phone2: '910003344', category: 'BC', selfieFileId: 'S1', passportFileId: 'P1', initialPayment: 1_000_000 };
  assert.equal((await call(A, 'POST', '/students', { ...form, initialPayment: 500_000 })).status, 400, '1 mlndan kam');
  assert.equal((await call(A, 'POST', '/students', { ...form, selfieFileId: '' })).status, 400, 'selfi shart');
  assert.equal((await call(A, 'POST', '/students', { ...form, groupId: 9999 })).status, 400, 'guruh topilmadi');
  const r = await call(A, 'POST', '/students', form);
  assert.equal(r.status, 200);
  assert.equal(r.body.debt, 6_200_000, 'BC 7,2 mln - 1 mln');
  assert.equal((await call(A, 'POST', '/students', form)).status, 400, 'takror telefon');
  assert.equal((await call(I, 'POST', '/students', form)).status, 403);
  assert.equal((await call(A, 'POST', `/payments/${r.body.paymentId}/send-receipt`)).status, 200);
  globalThis.__newStudent = r.body.id;
});

test('tahrirlash: ism, telefon, toifa', async () => {
  const id = globalThis.__newStudent;
  assert.equal((await call(A, 'PATCH', `/students/${id}`, { fullName: 'Yangi Nom Bahodir' })).status, 200);
  assert.equal((await call(A, 'GET', `/students/${id}`)).body.fullName, 'Yangi Nom Bahodir');
  assert.equal((await call(A, 'PATCH', `/students/${id}`, {})).status, 400, "o'zgarish yo'q");
  assert.equal((await call(A, 'PATCH', `/students/${id}`, { fullName: 'ab' })).status, 400);
  // boshqa o'quvchining telefoniga o'zgartirish rad etiladi
  const other = (await call(A, 'GET', '/students')).body.find((s) => s.id !== id);
  assert.equal((await call(A, 'PATCH', `/students/${id}`, { phone: other.phone })).status, 400);
  assert.equal((await call(A, 'PATCH', `/students/${id}`, { phone: '+998 93 555 66 77' })).status, 200);
  assert.equal((await call(A, 'GET', `/students/${id}`)).body.phone, '935556677');

  // toifa o'zgarishi: BC -> B tarif qayta qotadi
  const before = (await call(A, 'GET', `/students/${id}`)).body;
  assert.equal(before.total, 7_200_000);
  assert.equal((await call(A, 'PATCH', `/students/${id}`, { category: 'X' })).status, 400);
  assert.equal((await call(A, 'PATCH', `/students/${id}`, { category: 'B' })).status, 200);
  const after = (await call(A, 'GET', `/students/${id}`)).body;
  assert.equal(after.category, 'B');
  assert.equal(after.total, 5_500_000);
  assert.equal(after.instructorShare, 500_000);
  assert.equal(after.debt, 4_500_000);

  assert.equal((await call(I, 'PATCH', `/students/${id}`, { fullName: 'Hack Hack Hack' })).status, 403);
});

test('tahrirlash: instruktor ulushi to\'langan bo\'lsa toifa qulflanadi', async () => {
  const id = globalThis.__newStudent;
  assert.equal((await call(A, 'POST', `/students/${id}/assign-instructor`, { instructorId: 1 })).status, 200);
  assert.equal((await call(A, 'POST', `/students/${id}/instructor-paid`)).status, 200);
  const r = await call(A, 'PATCH', `/students/${id}`, { category: 'BC' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /to'langan/);
});

test('rasm yuklash: Telegram xatosi aniq sabab bilan qaytadi', async () => {
  process.env.ARCHIVE_CHAT_ID = 'bad-chat';
  try {
    const r = await call(A, 'POST', '/uploads/photo', { kind: 'selfie', data: jpegDataUrl() });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /chat not found/);
  } finally { delete process.env.ARCHIVE_CHAT_ID; }
});

test('hisobot va xarajat API', async () => {
  const q = `from=2000-01-01&to=2100-01-01`;
  const ov = await call(A, 'GET', `/report/overview?${q}&by=month`);
  assert.equal(ov.status, 200); assert.ok('profit' in ov.body.period && Array.isArray(ov.body.series));
  assert.equal((await call(A, 'GET', `/report/groups`)).status, 200);
  assert.equal((await call(A, 'GET', `/report/instructors?${q}`)).status, 200);
  assert.equal((await call(I, 'GET', `/report/overview?${q}`)).status, 403);
  assert.equal((await call(A, 'GET', `/report/overview?from=2026-11-05&to=2026-11-05`)).status, 400);
  const e = await call(A, 'POST', '/expenses', { amount: 150000, category: 'Reklama', note: 'banner', date: today() });
  assert.equal(e.status, 200);
  const l = await call(A, 'GET', `/expenses?${q}`);
  assert.ok(l.body.items.some((x) => x.id === e.body.id) && l.body.categories.includes('Ijara'));
  assert.equal((await call(A, 'POST', '/expenses', { amount: 0, category: 'Reklama' })).status, 400);
  assert.equal((await call(I, 'POST', '/expenses', { amount: 1000, category: 'Reklama' })).status, 403);
  assert.equal((await call(A, 'POST', `/expenses/${e.body.id}/cancel`, { reason: 'xato' })).status, 200);
  const g = await call(A, 'GET', '/groups');
  assert.equal((await call(A, 'POST', `/groups/${g.body[0].id}/instructor-paid`)).status, 200);
});
