'use strict';
require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const registerWizard = require('./src/registerWizard');
const registerSearchAssign = require('./src/searchAssign');
const registerActions = require('./src/actions');
const registerStudents = require('./src/students');
const S = require('./src/services');
const { createWeb } = require('./src/web');
const Rem = require('./src/reminders');

if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN yo\'q (.env)');
process.env.TZ = process.env.TZ || 'Asia/Tashkent';

const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_MENU = Markup.keyboard([
  ["Yangi o'quvchi", 'Qidirish'],
  ["O'quvchilar", 'Guruhlar'],
  ['Qarzdorlar', 'Muddati tugayotganlar'],
  ['Hisobot', 'Instruktorlar'],
]).resize();
const INSTR_MENU = Markup.keyboard([["Mening o'quvchilarim", 'Qidirish'], ['Qarzdorlar']]).resize();
const MENU_TEXTS = ["Yangi o'quvchi", "O'quvchilar", 'Qidirish', 'Qarzdorlar', 'Muddati tugayotganlar', 'Hisobot', 'Guruhlar', 'Instruktorlar', "Mening o'quvchilarim"];

bot.use(session());
bot.use(new Scenes.Stage([registerWizard]).middleware());

// Menyu tugmasi bosilsa, kutilayotgan kiritish bekor bo'ladi
bot.use((ctx, next) => {
  const t = ctx.message && ctx.message.text;
  if (t && ctx.session && MENU_TEXTS.includes(t)) { ctx.session.ask = null; ctx.session.awaitSearch = false; }
  return next();
});

registerSearchAssign(bot); // rol aniqlash, /find, instruktor biriktirish
registerActions(bot);      // to'lov, chek, hujjat, chegirma, guruh, ro'yxatlar, hisobot
registerStudents(bot);     // O'quvchilar: guruhli / guruhsiz, tanlab biriktirish

bot.start((ctx) => {
  if (ctx.state.role === 'admin') return ctx.reply('Admin panel', ADMIN_MENU);
  if (ctx.state.role === 'instructor') return ctx.reply(`Salom, ${ctx.state.instructor.name}`, INSTR_MENU);
  return ctx.reply(`Ruxsat yo'q. Sizning Telegram ID: ${ctx.from.id}\nAdminga yuboring.`);
});

bot.hears("Yangi o'quvchi", (ctx) => (ctx.state.role === 'admin' ? ctx.scene.enter('register') : ctx.reply("Ruxsat yo'q")));
bot.command('add', (ctx) => (ctx.state.role === 'admin' ? ctx.scene.enter('register') : ctx.reply("Ruxsat yo'q")));

bot.hears('Qidirish', (ctx) => {
  if (!ctx.state.role) return ctx.reply("Ruxsat yo'q");
  ctx.session.awaitSearch = true;
  return ctx.reply('Ism, telefon yoki #ID yozing:');
});

bot.catch((e, ctx) => {
  console.error('Bot xatosi:', e);
  ctx.reply('Ichki xato. Qayta urinib ko\'ring.').catch(() => {});
});

const WEBAPP_URL = (process.env.WEBAPP_URL || '').replace(/\/$/, '');

// Web ilovani ochish (initData faqat menyu tugmasi / inline tugma orqali keladi)
bot.command('ilova', (ctx) => {
  if (!ctx.state.role) return ctx.reply("Ruxsat yo'q");
  if (!WEBAPP_URL) return ctx.reply('Web ilova manzili (WEBAPP_URL) sozlanmagan');
  return ctx.reply('Ilovani oching:', Markup.inlineKeyboard([[Markup.button.webApp('Ilovani ochish', WEBAPP_URL)]]));
});

// Eslatmani hozir ko'rish (admin)
bot.command('eslatma', async (ctx) => {
  if (ctx.state.role !== 'admin') return ctx.reply("Ruxsat yo'q");
  const { admin } = await Rem.digests();
  return ctx.reply(admin || "Eslatma yo'q: muddati yaqin, muddatli qarzdor yoki guruhsiz o'quvchi topilmadi");
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createWeb(bot).listen(port, () => console.log(`Web server: port ${port}`));
  let reminders = { stop() {} };
  const stop = (sig) => { reminders.stop(); server.close(); bot.stop(sig); S.prisma.$disconnect(); };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  bot.launch({}, async () => {
    console.log('Bot: polling rejimi');
    reminders = Rem.startReminders(bot);
    if (WEBAPP_URL) {
      try {
        await bot.telegram.setChatMenuButton({ menuButton: { type: 'web_app', text: 'Ilova', web_app: { url: WEBAPP_URL } } });
        console.log('Menyu tugmasi: Ilova ->', WEBAPP_URL);
      } catch (e) { console.error('Menyu tugmasini sozlab bo\'lmadi:', e.message); }
    }
  }).catch((e) => { console.error('Bot ishga tushmadi:', e); process.exit(1); });
}

module.exports = bot;