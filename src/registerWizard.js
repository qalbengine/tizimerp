'use strict';
// Telegraf 4 WizardScene: o'quvchini ro'yxatga olish (faqat admin).
// Ulash:
//   const { Scenes, session } = require('telegraf');
//   const registerWizard = require('./src/registerWizard');
//   bot.use(session());
//   bot.use(new Scenes.Stage([registerWizard]).middleware());
//   bot.command('add', adminOnly, (ctx) => ctx.scene.enter('register'));
const { Scenes, Markup } = require('telegraf');
const S = require('./services');
const F = require('./finance');
const R = require('./receiptPdf');

const text = (ctx) => (ctx.message && ctx.message.text ? ctx.message.text.trim() : null);
const photo = (ctx) => (ctx.message && ctx.message.photo ? ctx.message.photo.at(-1).file_id : null);
const digits = (t) => String(t || '').replace(/\D/g, '');
const parseAmount = (t) => {
  const m = String(t).trim().toLowerCase().replace(/\s/g, '').match(/^(\d+(?:[.,]\d+)?)(mln|m)?$/);
  if (!m) return NaN;
  const n = parseFloat(m[1].replace(',', '.'));
  return Math.round(m[2] ? n * 1_000_000 : n);
};

const wizard = new Scenes.WizardScene(
  'register',

  async (ctx) => {
    ctx.wizard.state.d = {};
    await ctx.reply("Yangi o'quvchi. Bekor qilish: /cancel\n\n1/8 F.I.O.:");
    return ctx.wizard.next();
  },

  async (ctx) => {
    const t = text(ctx);
    if (!t || t.length < 5) return ctx.reply("F.I.O. ni to'liq yozing");
    ctx.wizard.state.d.fullName = t;
    await ctx.reply('2/8 Asosiy telefon raqami:');
    return ctx.wizard.next();
  },

  async (ctx) => {
    const t = text(ctx);
    if (!t || digits(t).length < 9) return ctx.reply("Telefon noto'g'ri, qayta yozing");
    ctx.wizard.state.d.phone = t;
    await ctx.reply("3/8 Qo'shimcha telefon raqami (boshqa odamniki yoki boshqa raqam):");
    return ctx.wizard.next();
  },

  async (ctx) => {
    const t = text(ctx);
    const d = ctx.wizard.state.d;
    if (!t || digits(t).length < 9) return ctx.reply("Telefon noto'g'ri, qayta yozing");
    if (digits(t).slice(-9) === digits(d.phone).slice(-9)) return ctx.reply('Asosiy raqam bilan bir xil. Boshqa raqam yozing');
    d.phone2 = t;
    await ctx.reply('4/8 Toifani tanlang:', Markup.inlineKeyboard([
      ['B', 'BC', 'C', 'E'].map((c) => Markup.button.callback(c, `cat_${c}`)),
    ]));
    return ctx.wizard.next();
  },

  async (ctx) => {
    const data = ctx.callbackQuery && ctx.callbackQuery.data;
    if (!data || !data.startsWith('cat_')) return ctx.reply('Toifani tugmadan tanlang');
    await ctx.answerCbQuery();
    ctx.wizard.state.d.category = data.slice(4);
    await ctx.reply('5/8 Selfi rasm yuboring (foto sifatida):');
    return ctx.wizard.next();
  },

  async (ctx) => {
    const id = photo(ctx);
    if (!id) return ctx.reply('Rasm yuboring (fayl emas, oddiy foto)');
    ctx.wizard.state.d.selfieFileId = id;
    await ctx.reply('6/8 Pasport rasmini yuboring:');
    return ctx.wizard.next();
  },

  async (ctx) => {
    const id = photo(ctx);
    if (!id) return ctx.reply('Rasm yuboring (fayl emas, oddiy foto)');
    ctx.wizard.state.d.passportFileId = id;
    const t = await S.prisma.tariff.findUnique({ where: { category: ctx.wizard.state.d.category } });
    ctx.wizard.state.total = t.total;
    await ctx.reply(`7/8 Ro'yxat to'lovi summasi (kamida ${F.fmt(F.MIN_REGISTRATION_PAYMENT)}; jami ${F.fmt(t.total)}):`);
    return ctx.wizard.next();
  },

  async (ctx) => {
    const n = parseAmount(text(ctx));
    const d = ctx.wizard.state.d;
    if (!Number.isFinite(n)) return ctx.reply("Summani raqamda yozing, masalan 1000000 yoki 1mln");
    if (n < F.MIN_REGISTRATION_PAYMENT) return ctx.reply(`Kamida ${F.fmt(F.MIN_REGISTRATION_PAYMENT)} bo'lishi kerak`);
    if (n > ctx.wizard.state.total) return ctx.reply(`Jami summadan oshmasin: ${F.fmt(ctx.wizard.state.total)}`);
    d.initialPayment = n;
    await ctx.reply(
      `8/8 Tasdiqlang:\n${d.fullName}\nToifa: ${d.category}\nTel: ${d.phone}, ${d.phone2}\nTo'lov: ${F.fmt(n)}`,
      Markup.inlineKeyboard([[Markup.button.callback('Tasdiqlash', 'ok'), Markup.button.callback('Bekor', 'no')]]),
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    const data = ctx.callbackQuery && ctx.callbackQuery.data;
    if (!data) return ctx.reply('Tugmadan tanlang');
    await ctx.answerCbQuery();
    if (data === 'no') { await ctx.reply('Bekor qilindi'); return ctx.scene.leave(); }
    try {
      const r = await S.registerStudent(ctx.from.id, ctx.wizard.state.d);
      await ctx.reply(
        `Ro'yxatga olindi: #${r.student.id} ${r.student.fullName}\nChek №${r.payment.id}: ${F.fmt(r.payment.amount)}\n` +
        `Qarz: ${F.fmt(r.calc.debt)}\nYakuniy muddat: ${r.student.deadline.toLocaleDateString('ru-RU')}`,
      );
      await R.sendReceipt(ctx, r.student, r.payment, r.calc);
    } catch (e) {
      await ctx.reply('Xato: ' + e.message);
    }
    return ctx.scene.leave();
  },
);

wizard.command('cancel', async (ctx) => { await ctx.reply('Bekor qilindi'); return ctx.scene.leave(); });

module.exports = wizard;
