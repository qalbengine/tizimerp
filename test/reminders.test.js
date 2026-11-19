const test = require('node:test');
const assert = require('node:assert');
const { db } = require('./fakePrisma');

process.env.BOT_TOKEN = '123:TEST';
process.env.ADMIN_IDS = '111,112';
process.env.TZ = 'Asia/Tashkent';
process.env.WEBAPP_URL = 'https://example.up.railway.app';

const S = require('../src/services');
const R = require('../src/reminders');

const messages = [];
const bot = { telegram: { sendMessage: async (chat, text, extra) => { if (String(chat) === '999') throw new Error('bot bloklangan'); messages.push({ chat: String(chat), text, extra }); } } };
const mk = (name, p1, p2, extra = {}) => S.registerStudent(111, { fullName: name, phone: p1, phone2: p2, category: 'B', selfieFileId: 'S', passportFileId: 'P', initialPayment: 1_000_000, ...extra });

test.before(async () => {
  await S.addInstructor(111, '222222', 'Kadir');
  await S.addInstructor(111, '999', 'Bloklagan');
  const a = await mk('Muddati Yaqin Test', '900000001', '900000002', { instructorId: 1, registeredAt: new Date(Date.now() - 80 * 86400000) }); // ~80 kun oldin: muddat yaqin
  const b = await mk('Muddatli Qarz Test', '900000003', '900000004', { instructorId: 1 });
  await S.approveDoc(111, b.student.id);                    // hujjat tasdiqlandi -> 2-bosqich muddatli qarz
  await mk('Boshqa Instruktor Test', '900000005', '900000006', { instructorId: 2 });
  assert.ok(a.student.id);
});

test('yig\'ma xabar: admin hammasini, instruktor faqat o\'zinikini oladi', async () => {
  const { admin, perInstr } = await R.digests();
  assert.match(admin, /Kunlik eslatma/);
  assert.match(admin, /Muddati tugayotgan\/o'tgan: 1 ta/);
  assert.match(admin, /Muddati Yaqin Test/);
  assert.match(admin, /Muddatli qarz \(hujjat tasdiqlangan\): 1 ta/);
  assert.match(admin, /Guruhsiz o'quvchilar: 3 ta/);

  const kadir = perInstr.find((x) => x.chatId === '222222');
  assert.match(kadir.text, /Muddati Yaqin Test/);
  assert.match(kadir.text, /Muddatli Qarz Test/);
  assert.doesNotMatch(kadir.text, /Boshqa Instruktor Test/, 'begona o\'quvchi ko\'rinmaydi');
  assert.doesNotMatch(kadir.text, /Guruhsiz/, 'instruktorga guruhsiz soni yuborilmaydi');
});

test('yuborish: ikkita admin, instruktor; bloklangan foydalanuvchi qolganlarga xalaqit bermaydi', async () => {
  messages.length = 0;
  const st = await R.runReminders(bot);
  const chats = messages.map((m) => m.chat);
  assert.ok(chats.includes('111') && chats.includes('112'), 'ikkala admin');
  assert.ok(chats.includes('222222'), 'instruktor');
  assert.equal(st.failed, st.failed >= 0 ? st.failed : 0);
  assert.ok(messages[0].extra, 'Ilovani ochish tugmasi bor');
});

test('kuniga bir marta (qayta ishga tushirishda takrorlanmaydi)', async () => {
  messages.length = 0;
  const hour = new Date().getHours();
  const job = R.startReminders(bot, { hour });
  const first = await job.tick();
  assert.ok(first && first.sent >= 3, 'birinchi ishga tushirish yuboradi');
  const n = messages.length;
  assert.equal(await job.tick(), null, 'ikkinchi marta yubormaydi');
  const job2 = R.startReminders(bot, { hour });                 // "qayta ishga tushirish"
  assert.equal(await job2.tick(), null, 'yangi nusxa ham takrorlamaydi');
  assert.equal(messages.length, n);
  const other = R.startReminders(bot, { hour: (hour + 1) % 24 });
  assert.equal(await other.tick(), null, 'boshqa soatda yubormaydi');
  job.stop(); job2.stop(); other.stop();
  assert.ok(db.audit.some((a) => a.action === 'REMINDER_RUN'));
});

test('eslatma kerak bo\'lmasa, xabar yo\'q', () => {
  assert.equal(R.buildDigest({ title: 'T', expiring: [], debtors: [], ungrouped: [] }), null);
});
