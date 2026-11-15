'use strict';
// Qidiruv + instruktorga biriktirish handlerlari.
// Ulash:
//   const registerSearchAssign = require('./src/searchAssign');
//   registerSearchAssign(bot);   // session() va Stage middleware'dan KEYIN chaqiring
// Komandalar: /find [so'rov], /instruktor_add <telegramId> <ism> (admin)
const { Markup } = require('telegraf');
const S = require('./services');
const F = require('./finance');

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
const day = (x) => (x ? new Date(x).toLocaleDateString('ru-RU') : '—');

function card(s, role) {
  const c = F.calc(s, s.payments);
  const L = [`#${s.id} ${s.fullName} (${s.category})`];
  if (role === 'admin') L.push(`Tel: +998${s.phone}${s.phone2 ? ', +998' + s.phone2 : ''}`);
  L.push(
    `Guruh: ${s.group ? s.group.name : '—'}`,
    `Instruktor: ${s.instructor ? s.instructor.name : 'biriktirilmagan'}`,
    `Jami: ${F.fmt(c.net)} | To'langan: ${F.fmt(c.paid)}`,
    `Qarz: ${F.fmt(c.debt)}${c.dueNow ? ` (muddatli: ${F.fmt(c.dueNow)})` : ''}`,
    `Boshlanish: ${day(s.startDate)} | Tugash: ${day(s.endDate)}`,
    `Yakuniy muddat: ${day(s.deadline)}`,
  );
  return L.join('\n');
}

module.exports = function registerSearchAssign(bot) {
  // Rol aniqlash
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      if (ADMIN_IDS.includes(String(ctx.from.id))) ctx.state.role = 'admin';
      else {
        const ins = await S.getInstructorByTelegramId(ctx.from.id);
        if (ins && ins.active) { ctx.state.role = 'instructor'; ctx.state.instructor = ins; }
      }
    }
    return next();
  });

  const isAdmin = (ctx) => ctx.state.role === 'admin';
  const myInstructorId = (ctx) => (ctx.state.role === 'instructor' ? ctx.state.instructor.id : null);

  async function showCard(ctx, s) {
    const b = (t, a) => Markup.button.callback(t, `${a}_${s.id}`);
    const rows = isAdmin(ctx)
      ? [
        [b('Instruktorga biriktirish', 'as'), b('Guruhga biriktirish', 'grp')],
        [b("To'lov qo'shish", 'pay'), b("To'lovlar", 'pays')],
        [b('Hujjat tasdiqlandi', 'doc'), b('Chegirma', 'disc')],
        [b('Boshlanish sanasi', 'start'), b("Instr. to'landi", 'ip')],
        [b("Tashqi o'tkazma", 'ext'), b('Rasmlar', 'ph')],
        [b("O'chirish", 'del')],
      ]
      : [[b("To'lovlar", 'pays')]];
    return ctx.reply(card(s, ctx.state.role), Markup.inlineKeyboard(rows));
  }

  async function doSearch(ctx, q) {
    if (!ctx.state.role) return ctx.reply("Ruxsat yo'q");
    let list;
    try { list = await S.searchStudents(q, { instructorId: myInstructorId(ctx) }); }
    catch (e) { return ctx.reply(e.message); }
    if (!list.length) return ctx.reply('Topilmadi');
    if (list.length === 1) return showCard(ctx, list[0]);
    const more = list.length >= 10 ? ". Ko'p natija, aniqroq yozing" : '';
    return ctx.reply(
      `Topildi: ${list.length}${more}`,
      Markup.inlineKeyboard(list.map((s) => [Markup.button.callback(`#${s.id} ${s.fullName} (${s.category})`, `st_${s.id}`)])),
    );
  }

  bot.command('find', async (ctx) => {
    if (!ctx.state.role) return ctx.reply("Ruxsat yo'q");
    const q = ctx.message.text.replace(/^\/find(@\w+)?\s*/i, '').trim();
    if (q) return doSearch(ctx, q);
    ctx.session = ctx.session || {};
    ctx.session.awaitSearch = true;
    return ctx.reply('Ism, telefon yoki #ID yozing:');
  });

  // /find dan keyin keladigan oddiy matn
  bot.use(async (ctx, next) => {
    const t = ctx.message && ctx.message.text;
    if (ctx.session && ctx.session.awaitSearch && t && !t.startsWith('/')) {
      ctx.session.awaitSearch = false;
      return doSearch(ctx, t);
    }
    return next();
  });

  bot.action(/^st_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.role) return;
    const s = await S.getStudentCard(Number(ctx.match[1]));
    const iid = myInstructorId(ctx);
    if (!s || (iid && s.instructorId !== iid)) return ctx.reply('Topilmadi');
    return showCard(ctx, s);
  });

  bot.action(/^ph_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;
    const s = await S.getStudentCard(Number(ctx.match[1]));
    if (!s) return ctx.reply('Topilmadi');
    if (s.selfieFileId) await ctx.replyWithPhoto(s.selfieFileId, { caption: 'Selfi' });
    if (s.passportFileId) await ctx.replyWithPhoto(s.passportFileId, { caption: 'Pasport' });
    if (!s.selfieFileId && !s.passportFileId) await ctx.reply("Rasm yo'q");
  });

  bot.action(/^as_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;
    const sid = Number(ctx.match[1]);
    const list = await S.listInstructors();
    const rows = list.map((i) => [Markup.button.callback(i.name, `asg_${sid}_${i.id}`)]);
    rows.push([Markup.button.callback('Biriktirishni olib tashlash', `asg_${sid}_0`)]);
    return ctx.reply(list.length ? 'Instruktorni tanlang:' : "Instruktor yo'q. /instruktor_add <telegramId> <ism>", Markup.inlineKeyboard(rows));
  });

  bot.action(/^asg_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;
    const sid = Number(ctx.match[1]);
    const iid = Number(ctx.match[2]) || null;
    try {
      const u = await S.assignInstructor(ctx.from.id, sid, iid);
      await ctx.reply(iid ? `#${sid} ${u.instructor.name} ga biriktirildi` : `#${sid} biriktirish olib tashlandi`);
    } catch (e) { await ctx.reply('Xato: ' + e.message); }
  });

  bot.command('instruktor_add', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const m = ctx.message.text.replace(/[<>]/g, '').match(/^\/instruktor_add(?:@\w+)?\s+(\d+)\s+(.+)$/i);
    if (!m) return ctx.reply('Format (qavssiz): /instruktor_add 123456789 Ism Familiya');
    try {
      const i = await S.addInstructor(ctx.from.id, m[1], m[2]);
      await ctx.reply(`Instruktor qo'shildi: ${i.name}`);
    } catch (e) { await ctx.reply('Xato: ' + e.message); }
  });
};
