'use strict';
// "O'quvchilar" bo'limi: Guruhli / Guruhsiz. Guruhsizlarni belgilab, guruhga biriktirish.
const { Markup } = require('telegraf');
const S = require('./services');

const PAGE = 15;

module.exports = function registerStudents(bot) {
  const isAdmin = (ctx) => ctx.state.role === 'admin';
  const admin = (fn) => (ctx) => {
    if (isAdmin(ctx)) return fn(ctx);
    return ctx.callbackQuery ? ctx.answerCbQuery("Ruxsat yo'q") : ctx.reply("Ruxsat yo'q");
  };
  const pick = (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.pick = ctx.session.pick || { ids: [], page: 0 };
    return ctx.session.pick;
  };
  // tugmadan bosilganda xabarni yangilaydi, aks holda yangi xabar yuboradi
  async function say(ctx, text, kb) {
    if (ctx.callbackQuery) {
      try { return await ctx.editMessageText(text, kb); } catch (e) {
        if (/not modified/i.test(e.message)) return undefined;
      }
    }
    return ctx.reply(text, kb);
  }

  async function home(ctx) {
    const [groups, ungrouped] = await Promise.all([S.listGroups(), S.listUngrouped()]);
    const inGroups = groups.reduce((a, g) => a + g._count.students, 0);
    return ctx.reply("O'quvchilar:", Markup.inlineKeyboard([[
      Markup.button.callback(`Guruhli (${inGroups})`, 'ol_yes'),
      Markup.button.callback(`Guruhsiz (${ungrouped.length})`, 'ol_no'),
    ]]));
  }
  bot.hears("O'quvchilar", admin(home));
  bot.command('oquvchilar', admin(home));

  // ---------- Guruhli: guruhlar ro'yxati (guruh ichi: gr_ handler) ----------
  bot.action('ol_yes', admin(async (ctx) => {
    await ctx.answerCbQuery();
    const groups = await S.listGroups();
    if (!groups.length) return say(ctx, "Guruh yo'q. Guruhsiz bo'limidan o'quvchilarni belgilab yangi guruh yarating");
    return say(ctx, 'Guruhni tanlang:', Markup.inlineKeyboard(
      groups.map((g) => [Markup.button.callback(`${g.name} (${g._count.students})`, `gr_${g.id}`)]),
    ));
  }));

  // ---------- Guruhsiz: belgilash ----------
  async function render(ctx) {
    const p = pick(ctx);
    const list = await S.listUngrouped();
    if (!list.length) return say(ctx, "Guruhsiz o'quvchi yo'q");
    const alive = new Set(list.map((s) => s.id));
    p.ids = p.ids.filter((id) => alive.has(id));
    const pages = Math.ceil(list.length / PAGE);
    p.page = Math.min(Math.max(p.page, 0), pages - 1);
    const slice = list.slice(p.page * PAGE, (p.page + 1) * PAGE);

    const rows = slice.map((s) => [Markup.button.callback(
      `${p.ids.includes(s.id) ? '☑' : '☐'} ${s.fullName} (${s.category})`, `pk_${s.id}`)]);
    const nav = [];
    if (p.page > 0) nav.push(Markup.button.callback('‹ Oldingi', `pg_${p.page - 1}`));
    if (p.page < pages - 1) nav.push(Markup.button.callback('Keyingi ›', `pg_${p.page + 1}`));
    if (nav.length) rows.push(nav);
    rows.push([Markup.button.callback('Sahifani belgilash', 'pk_all'), Markup.button.callback('Tozalash', 'pk_clr')]);
    if (p.ids.length) rows.push([Markup.button.callback(`Guruhga biriktirish (${p.ids.length})`, 'pk_go')]);
    return say(ctx, `Guruhsiz o'quvchilar: ${list.length} ta | sahifa ${p.page + 1}/${pages}\nTanlandi: ${p.ids.length}`, Markup.inlineKeyboard(rows));
  }

  bot.action('ol_no', admin(async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {};
    ctx.session.pick = { ids: [], page: 0 };
    return render(ctx);
  }));

  bot.action(/^pg_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    pick(ctx).page = Number(ctx.match[1]);
    return render(ctx);
  }));

  bot.action(/^pk_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const p = pick(ctx);
    const id = Number(ctx.match[1]);
    p.ids = p.ids.includes(id) ? p.ids.filter((x) => x !== id) : [...p.ids, id];
    return render(ctx);
  }));

  bot.action('pk_all', admin(async (ctx) => {
    await ctx.answerCbQuery();
    const p = pick(ctx);
    const list = await S.listUngrouped();
    const ids = list.slice(p.page * PAGE, (p.page + 1) * PAGE).map((s) => s.id);
    const allOn = ids.every((id) => p.ids.includes(id));
    p.ids = allOn ? p.ids.filter((id) => !ids.includes(id)) : [...new Set([...p.ids, ...ids])];
    return render(ctx);
  }));

  bot.action('pk_clr', admin(async (ctx) => {
    await ctx.answerCbQuery();
    pick(ctx).ids = [];
    return render(ctx);
  }));

  // ---------- Guruh tanlash va biriktirish ----------
  bot.action('pk_go', admin(async (ctx) => {
    const p = pick(ctx);
    if (!p.ids.length) return ctx.answerCbQuery('Avval o\'quvchilarni belgilang');
    await ctx.answerCbQuery();
    const groups = await S.listGroups();
    const rows = groups.map((g) => [Markup.button.callback(`${g.name} (${g._count.students})`, `pkg_${g.id}`)]);
    rows.push([Markup.button.callback('+ Yangi guruh yaratish', 'pk_newgrp')]);
    rows.push([Markup.button.callback('‹ Orqaga', 'ol_back')]);
    return say(ctx, `${p.ids.length} ta o'quvchi. Qaysi guruhga biriktiramiz?`, Markup.inlineKeyboard(rows));
  }));

  bot.action('ol_back', admin(async (ctx) => { await ctx.answerCbQuery(); return render(ctx); }));

  bot.action(/^pkg_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const p = pick(ctx);
    try {
      const r = await S.assignGroupMany(ctx.from.id, p.ids, Number(ctx.match[1]));
      p.ids = [];
      await ctx.reply(`${r.count} ta o'quvchi "${r.group.name}" guruhiga biriktirildi`);
      return render(ctx);
    } catch (e) { return ctx.reply('Xato: ' + e.message); }
  }));

  bot.action('pk_newgrp', admin(async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.ask = { type: 'pknewgrp' };
    return ctx.reply('Yangi guruh nomi (tanlanganlar shu guruhga biriktiriladi):\n(/cancel: bekor qilish)');
  }));
};
