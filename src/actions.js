'use strict';
// Admin amallari (to'lov, chek, hujjat, chegirma, sana, guruh, o'chirish) va ro'yxatlar.
const { Markup } = require('telegraf');
const S = require('./services');
const Rep = require('./reports');
const F = require('./finance');
const U = require('./util');
const R = require('./receiptPdf');

module.exports = function registerActions(bot) {
  const isAdmin = (ctx) => ctx.state.role === 'admin';
  const deny = (ctx) => (ctx.callbackQuery ? ctx.answerCbQuery("Ruxsat yo'q") : ctx.reply("Ruxsat yo'q"));
  const admin = (fn) => (ctx) => (isAdmin(ctx) ? fn(ctx) : deny(ctx));
  const sid = (ctx) => Number(ctx.match[1]);
  const fail = (ctx, e) => ctx.reply('Xato: ' + e.message);

  function ask(ctx, state, prompt) {
    ctx.session = ctx.session || {};
    ctx.session.ask = state;
    return ctx.reply(prompt + '\n(/cancel: bekor qilish)');
  }
  // instruktor faqat o'z o'quvchisini ko'radi
  const canSee = (ctx, s) =>
    !!s && (isAdmin(ctx) || (ctx.state.role === 'instructor' && s.instructorId === ctx.state.instructor.id));

  bot.command('cancel', async (ctx) => {
    if (ctx.session) { ctx.session.ask = null; ctx.session.awaitSearch = false; }
    return ctx.reply('Bekor qilindi');
  });

  // ---------- Matn kiritish (ask holati) ----------
  bot.on('text', async (ctx, next) => {
    const a = ctx.session && ctx.session.ask;
    const t = ctx.message.text.trim();
    if (!a || t.startsWith('/')) return next();
    if (!isAdmin(ctx)) { ctx.session.ask = null; return next(); }
    const actor = ctx.from.id;
    try {
      switch (a.type) {
        case 'pay': {
          const n = U.parseAmount(t);
          if (!Number.isFinite(n)) return ctx.reply('Summani raqamda yozing, masalan 500000 yoki 0.5mln');
          const r = await S.addPayment(actor, a.sid, n);
          ctx.session.ask = null;
          const s = await S.getStudentCard(a.sid);
          return R.sendReceipt(ctx, s, r.payment, r.calc, U.receipt(s, r.payment, r.calc));
        }
        case 'disc1': {
          const n = U.parseAmount(t);
          if (!Number.isFinite(n)) return ctx.reply('Summani raqamda yozing');
          ctx.session.ask = { type: 'disc2', sid: a.sid, amount: n };
          return ctx.reply('Chegirma sababi:');
        }
        case 'disc2': {
          await S.setDiscount(actor, a.sid, a.amount, t);
          ctx.session.ask = null;
          const s = await S.getStudentCard(a.sid);
          const c = F.calc(s, s.payments);
          return ctx.reply(`Chegirma: ${F.fmt(a.amount)}. Yangi jami: ${F.fmt(c.net)}, qarz: ${F.fmt(c.debt)}`);
        }
        case 'start': {
          const d = U.parseDate(t);
          if (!d) return ctx.reply('Sana formati: dd.mm.yyyy');
          const u = await S.setStartDate(actor, a.sid, d);
          ctx.session.ask = null;
          return ctx.reply(`Boshlanish: ${U.day(u.startDate)}, tugash: ${U.day(u.endDate)}`);
        }
        case 'grstart': {
          const d = U.parseDate(t);
          if (!d) return ctx.reply('Sana formati: dd.mm.yyyy');
          const r = await S.setGroupStartDate(actor, a.gid, d);
          ctx.session.ask = null;
          const f = r.failed.length ? `\nXato: ${r.failed.map((x) => `#${x.id} ${x.msg}`).join('; ')}` : '';
          return ctx.reply(`Sana qo'yildi: ${r.ok} ta o'quvchi.${f}`);
        }
        case 'cancelpay': {
          await S.cancelPayment(actor, a.pid, t);
          ctx.session.ask = null;
          return ctx.reply(`Chek №${a.pid} bekor qilindi`);
        }
        case 'ext': {
          const n = U.parseAmount(t);
          if (!Number.isFinite(n)) return ctx.reply('Summani raqamda yozing');
          await S.transferExternal(actor, a.sid, n);
          ctx.session.ask = null;
          return ctx.reply(`Tashqariga o'tkazildi: ${F.fmt(n)}`);
        }
        case 'pknewgrp': {
          const g = await S.createGroup(actor, t);
          const ids = (ctx.session.pick && ctx.session.pick.ids) || [];
          const r = ids.length ? await S.assignGroupMany(actor, ids, g.id) : { count: 0 };
          ctx.session.ask = null; ctx.session.pick = null;
          return ctx.reply(`Guruh yaratildi: ${g.name}. Biriktirildi: ${r.count} ta o'quvchi`);
        }
        case 'grpnew': {
          const g = await S.createGroup(actor, t);
          ctx.session.ask = null;
          return ctx.reply(`Guruh yaratildi: ${g.name}`);
        }
        default:
          ctx.session.ask = null;
          return next();
      }
    } catch (e) {
      return fail(ctx, e); // ask saqlanadi, qayta yozish yoki /cancel
    }
  });

  // ---------- Chekni tekshirish (QR matni yoki /tekshir <raqam> <kod>) ----------
  async function verifyText(ctx, t) {
    const idm = t.match(/№\s*(\d+)/) || t.match(/^\/tekshir\S*\s+(\d+)/i);
    const km = t.match(/Kod:\s*([0-9a-f]{10})/i) || t.match(/^\/tekshir\S*\s+\d+\s+([0-9a-f]{10})/i);
    if (!idm || !km) return ctx.reply('Format: /tekshir <chek raqami> <kod> yoki QR matnini shunday yuboring');
    const full = await S.getPaymentFull(Number(idm[1]));
    if (!full) return ctx.reply("Chek topilmadi (o'quvchi o'chirilgan bo'lishi mumkin)");
    if (R.receiptSig(full.payment) !== km[1].toLowerCase()) return ctx.reply("SOXTA yoki o'zgartirilgan chek: kod mos kelmadi");
    const p = full.payment;
    return ctx.reply([
      'Chek haqiqiy',
      `№${p.id} | ${U.dateTime(p.paidAt)}`,
      `O'quvchi: ${full.student.fullName} (#${full.student.id}, ${full.student.category})`,
      `Summa: ${F.fmt(p.amount)}`,
      p.status === 'ACTIVE' ? 'Holati: amalda' : `Holati: BEKOR QILINGAN (${p.cancelReason || '—'})`,
    ].join('\n'));
  }
  bot.command('tekshir', admin((ctx) => verifyText(ctx, ctx.message.text)));
  bot.hears(/Kod:\s*[0-9a-f]{10}/i, admin((ctx) => verifyText(ctx, ctx.message.text)));

  // ---------- To'lov ----------
  bot.action(/^pay_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const s = await S.getStudentCard(sid(ctx));
    if (!s) return ctx.reply('Topilmadi');
    const c = F.calc(s, s.payments);
    if (c.debt <= 0) return ctx.reply("Qarz yo'q, to'lov kerak emas");
    return ask(ctx, { type: 'pay', sid: s.id }, `${s.fullName}. Qarz: ${F.fmt(c.debt)}\nTo'lov summasi:`);
  }));

  bot.action(/^pays_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await S.getStudentCard(sid(ctx));
    if (!canSee(ctx, s)) return ctx.reply('Topilmadi');
    const pays = [...s.payments].sort((a, b) => a.id - b.id);
    if (!pays.length) return ctx.reply("To'lov yo'q");
    const lines = pays.map((p) =>
      `№${p.id} | ${U.dateTime(p.paidAt)} | ${F.fmt(p.amount)}${p.status === 'CANCELLED' ? ` | BEKOR: ${p.cancelReason}` : ''}`);
    const rows = pays.map((p) => {
      const r = [Markup.button.callback(`PDF chek №${p.id}`, `rc_${p.id}`)];
      if (isAdmin(ctx) && p.status === 'ACTIVE') r.push(Markup.button.callback(`Bekor №${p.id}`, `cx_${p.id}`));
      return r;
    });
    return ctx.reply(`${s.fullName}: to'lovlar\n` + lines.join('\n'), Markup.inlineKeyboard(rows));
  });

  bot.action(/^rc_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const full = await S.getPaymentFull(sid(ctx));
    if (!full || !canSee(ctx, full.student)) return ctx.reply('Topilmadi');
    return R.sendReceipt(ctx, full.student, full.payment, R.calcAsOf(full.student, full.payment));
  });

  bot.action(/^cx_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    return ask(ctx, { type: 'cancelpay', pid: sid(ctx) }, `Chek №${sid(ctx)} ni bekor qilish. Sababi:`);
  }));

  // ---------- Hujjat, chegirma, sana ----------
  bot.action(/^doc_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await S.approveDoc(ctx.from.id, sid(ctx));
      const s = await S.getStudentCard(sid(ctx));
      const c = F.calc(s, s.payments);
      return ctx.reply(`Hujjat tasdiqlandi. Muddatli qarz: ${F.fmt(c.dueNow)}`);
    } catch (e) { return fail(ctx, e); }
  }));

  bot.action(/^disc_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    return ask(ctx, { type: 'disc1', sid: sid(ctx) }, 'Chegirma summasi (0 = olib tashlash):');
  }));

  bot.action(/^start_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    return ask(ctx, { type: 'start', sid: sid(ctx) }, "O'qish boshlanish sanasi (dd.mm.yyyy), ro'yxatdan 10 kundan oshmasin:");
  }));

  // ---------- Instruktor ulushi, tashqi o'tkazma ----------
  bot.action(/^ip_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const s = await S.getStudentCard(sid(ctx));
    if (!s) return ctx.reply('Topilmadi');
    if (!s.instructorId) return ctx.reply('Avval instruktor biriktiring');
    try {
      await S.markInstructorPaid(ctx.from.id, s.id);
      return ctx.reply(`Instruktor ulushi to'langan: ${F.fmt(s.instructorShare)} (${s.instructor.name})`);
    } catch (e) { return fail(ctx, e); }
  }));

  bot.action(/^ext_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const s = await S.getStudentCard(sid(ctx));
    if (!s) return ctx.reply('Topilmadi');
    const c = F.calc(s, s.payments);
    if (c.extToTransfer <= 0) return ctx.reply("O'tkaziladigan summa yo'q");
    return ask(ctx, { type: 'ext', sid: s.id }, `O'tkazilishi kerak: ${F.fmt(c.extToTransfer)}\nO'tkazilgan summa:`);
  }));

  // ---------- Guruh ----------
  bot.action(/^grp_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const list = await S.listGroups();
    const rows = list.map((g) => [Markup.button.callback(g.name, `grpset_${sid(ctx)}_${g.id}`)]);
    rows.push([Markup.button.callback('Guruhdan olib tashlash', `grpset_${sid(ctx)}_0`)]);
    return ctx.reply(list.length ? 'Guruhni tanlang:' : "Guruh yo'q. Menyudan 'Guruhlar' orqali yarating", Markup.inlineKeyboard(rows));
  }));

  bot.action(/^grpset_(\d+)_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const gid = Number(ctx.match[2]) || null;
    try {
      const u = await S.assignGroup(ctx.from.id, Number(ctx.match[1]), gid);
      return ctx.reply(gid ? `#${u.id} guruhga biriktirildi: ${u.group.name}` : `#${u.id} guruhdan olib tashlandi`);
    } catch (e) { return fail(ctx, e); }
  }));

  bot.action('grp_new', admin(async (ctx) => {
    await ctx.answerCbQuery();
    return ask(ctx, { type: 'grpnew' }, 'Yangi guruh nomi:');
  }));

  bot.action(/^gr_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const list = await S.listGroupStudents(sid(ctx));
    const lines = list.map((s) => {
      const c = F.calc(s, s.payments);
      return `#${s.id} ${s.fullName} (${s.category}) | boshl: ${U.day(s.startDate)} | qarz ${F.fmt(c.debt)}`;
    });
    await U.sendLong(ctx, `Guruh o'quvchilari: ${list.length}`, lines);
    return ctx.reply('Amal:', Markup.inlineKeyboard([[Markup.button.callback("Boshlanish sanasini qo'yish", `grstart_${sid(ctx)}`)]]));
  }));

  bot.action(/^grstart_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    return ask(ctx, { type: 'grstart', gid: sid(ctx) }, "Guruhdagi sanasi yo'q o'quvchilar uchun boshlanish sanasi (dd.mm.yyyy):");
  }));

  // ---------- O'chirish ----------
  bot.action(/^del_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply(`#${sid(ctx)} o'quvchini o'chirasizmi?`, Markup.inlineKeyboard([[
      Markup.button.callback('Ha, ochirish', `delok_${sid(ctx)}`), Markup.button.callback('Yoq', 'noop'),
    ]]));
  }));
  bot.action(/^delok_(\d+)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    try { await S.deleteStudent(ctx.from.id, sid(ctx)); return ctx.reply("O'chirildi (arxivda saqlanadi)"); }
    catch (e) { return fail(ctx, e); }
  }));
  bot.action('noop', (ctx) => ctx.answerCbQuery('Bekor'));

  // ---------- Ro'yxatlar (menyu) ----------
  bot.hears('Qarzdorlar', async (ctx) => {
    if (!ctx.state.role) return deny(ctx);
    const iid = ctx.state.role === 'instructor' ? ctx.state.instructor.id : null;
    const list = await S.debtors(iid);
    if (!list.length) return ctx.reply("Qarzdor yo'q");
    const total = list.reduce((a, s) => a + s.calc.debt, 0);
    const lines = list.map((s) =>
      `#${s.id} ${s.fullName} (${s.category}) | qarz ${F.fmt(s.calc.debt)}${s.calc.dueNow ? ` | muddatli ${F.fmt(s.calc.dueNow)}` : ''}`);
    return U.sendLong(ctx, `Qarzdorlar: ${list.length} ta, jami ${F.fmt(total)}\n(Karta: /find #ID)`, lines);
  });

  bot.hears('Muddati tugayotganlar', admin(async (ctx) => {
    const list = await S.expiring(7);
    if (!list.length) return ctx.reply("7 kun ichida muddati tugaydigan o'quvchi yo'q");
    const lines = list.map((s) =>
      `${s.overdue ? "[MUDDAT O'TGAN] " : ''}#${s.id} ${s.fullName} (${s.category}) | muddat ${U.day(s.deadline)} | qarz ${F.fmt(s.calc.debt)} | ${s.instructor ? s.instructor.name : 'instruktorsiz'}`);
    return U.sendLong(ctx, `Muddati tugayotganlar: ${list.length} ta`, lines);
  }));

  bot.hears("Mening o'quvchilarim", async (ctx) => {
    if (ctx.state.role !== 'instructor') return deny(ctx);
    const list = await S.listByInstructor(ctx.state.instructor.id);
    if (!list.length) return ctx.reply("O'quvchi yo'q");
    const rows = list.slice(0, 60).map((s) => {
      const c = F.calc(s, s.payments);
      return [Markup.button.callback(`#${s.id} ${s.fullName} (${s.category}) | qarz ${F.fmt(c.debt)}`, `st_${s.id}`)];
    });
    return ctx.reply(`O'quvchilar: ${list.length}`, Markup.inlineKeyboard(rows));
  });

  bot.hears('Guruhlar', admin(async (ctx) => {
    const list = await S.listGroups();
    const rows = list.map((g) => [Markup.button.callback(`${g.name} (${g._count.students})`, `gr_${g.id}`)]);
    rows.push([Markup.button.callback('Yangi guruh', 'grp_new')]);
    return ctx.reply('Guruhlar:', Markup.inlineKeyboard(rows));
  }));

  bot.hears('Instruktorlar', admin(async (ctx) => {
    const list = await S.instructorSummary();
    if (!list.length) return ctx.reply("Instruktor yo'q. /instruktor_add <telegramId> <ism>");
    const lines = list.map((i) =>
      `${i.name} (${i.telegramId}) | o'quvchi ${i.count} | hisoblangan ${F.fmt(i.accrued)} | to'langan ${F.fmt(i.paid)} | qolgan ${F.fmt(i.unpaid)}`);
    return U.sendLong(ctx, 'Instruktorlar:', lines);
  }));

  // ---------- Hisobot ----------
  bot.hears('Hisobot', admin((ctx) => ctx.reply('Davr:', Markup.inlineKeyboard([[
    Markup.button.callback('Bugun', 'rep_today'), Markup.button.callback('Shu oy', 'rep_month'), Markup.button.callback('Hammasi', 'rep_all'),
  ]]))));

  bot.action(/^rep_(today|month|all)$/, admin(async (ctx) => {
    await ctx.answerCbQuery();
    const now = new Date();
    let from; let to; let name;
    if (ctx.match[1] === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); to = F.addDays(from, 1); name = 'Bugun';
    } else if (ctx.match[1] === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 1); name = 'Shu oy';
    } else { from = new Date(2000, 0, 1); to = new Date(2100, 0, 1); name = 'Hammasi'; }
    const r = await Rep.overview(from, to, 'day');
    return ctx.reply(`Hisobot: ${name}\n\n` + Rep.formatOverview(r));
  }));
};
