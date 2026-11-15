'use strict';
// Kunlik eslatmalar: admin va instruktorlarga muddati yaqin / muddatli qarzdor o'quvchilar haqida.
// Sozlamalar (.env): REMINDER_HOUR (standart 9, mahalliy soat), REMINDERS=off (o'chirish)
const { Markup } = require('telegraf');
const S = require('./services');
const F = require('./finance');
const U = require('./util');

const DAYS = 7;   // necha kun oldin ogohlantirish
const MAX = 15;   // xabarda ko'rsatiladigan qatorlar (qolgani "…yana N ta")
const ADMIN_IDS = () => (process.env.ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lines = (list, fmtLine) => {
  const out = list.slice(0, MAX).map(fmtLine);
  if (list.length > MAX) out.push(`…yana ${list.length - MAX} ta`);
  return out;
};

// expiring: S.expiring natijasi, debtors: S.debtors natijasi (ikkalasida ham .calc bor)
function buildDigest({ title, expiring, debtors, ungrouped = [] }) {
  const due = debtors.filter((s) => s.calc.dueNow > 0);
  const parts = [];
  if (expiring.length) {
    parts.push(`Muddati tugayotgan/o'tgan: ${expiring.length} ta`);
    parts.push(...lines(expiring, (s) =>
      `${s.overdue ? "[O'TGAN] " : ''}#${s.id} ${s.fullName} (${s.category}) | muddat ${U.day(s.deadline)} | qarz ${F.fmt(s.calc.debt)}`));
    parts.push('');
  }
  if (due.length) {
    const total = due.reduce((a, s) => a + s.calc.dueNow, 0);
    parts.push(`Muddatli qarz (hujjat tasdiqlangan): ${due.length} ta, jami ${F.fmt(total)}`);
    parts.push(...lines(due, (s) => `#${s.id} ${s.fullName} (${s.category}) | ${F.fmt(s.calc.dueNow)}`));
    parts.push('');
  }
  if (ungrouped.length) parts.push(`Guruhsiz o'quvchilar: ${ungrouped.length} ta`);
  if (!parts.some((x) => x)) return null;
  return `${title} (${U.day(new Date())})\n\n${parts.join('\n').trim()}`;
}

async function digests() {
  const [expiring, debtors, ungrouped, instructors] = await Promise.all([
    S.expiring(DAYS), S.debtors(null), S.listUngrouped(), S.instructorSummary(),
  ]);
  const admin = buildDigest({ title: 'Kunlik eslatma', expiring, debtors, ungrouped });
  const perInstr = instructors.map((i) => ({
    chatId: String(i.telegramId),
    text: buildDigest({
      title: `Eslatma: ${i.name}`,
      expiring: expiring.filter((s) => s.instructorId === i.id),
      debtors: debtors.filter((s) => s.instructorId === i.id),
    }),
  })).filter((x) => x.text);
  return { admin, perInstr };
}

function openAppButton() {
  const url = (process.env.WEBAPP_URL || '').replace(/\/$/, '');
  return url ? Markup.inlineKeyboard([[Markup.button.webApp('Ilovani ochish', url)]]) : undefined;
}

async function runReminders(bot) {
  const { admin, perInstr } = await digests();
  const stats = { sent: 0, failed: 0 };
  const extra = openAppButton();
  const send = async (chatId, text) => {
    try { await bot.telegram.sendMessage(chatId, text, extra); stats.sent++; } catch (e) {
      stats.failed++;
      console.error('Eslatma yuborilmadi:', chatId, e.message); // masalan, foydalanuvchi botni bloklagan
    }
    await sleep(60);
  };
  if (admin) for (const id of ADMIN_IDS()) await send(id, admin);
  for (const x of perInstr) await send(x.chatId, x.text);
  return stats;
}

// Kuniga bir marta: AuditLog dagi REMINDER_RUN yozuvi qayta ishga tushirishda takrorlanishdan saqlaydi
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const alreadyRan = async (now) => !!(await S.prisma.auditLog.findFirst({
  where: { action: 'REMINDER_RUN', createdAt: { gte: startOfDay(now) } },
}));
const markRan = (data) => S.prisma.auditLog.create({ data: { actorId: BigInt(0), action: 'REMINDER_RUN', entity: 'System', data } });

function startReminders(bot, opts = {}) {
  if (process.env.REMINDERS === 'off') return { stop() {}, tick: async () => {} };
  const hour = opts.hour !== undefined ? opts.hour : (process.env.REMINDER_HOUR !== undefined ? Number(process.env.REMINDER_HOUR) : 9);
  let busy = false;

  async function tick() {
    if (busy) return null;
    const now = opts.now ? opts.now() : new Date();
    if (now.getHours() !== hour) return null;
    busy = true;
    try {
      if (await alreadyRan(now)) return null;
      await markRan({ at: now.toISOString() });
      const stats = await runReminders(bot);
      console.log('Eslatmalar yuborildi:', stats);
      return stats;
    } catch (e) {
      console.error('Eslatma xatosi:', e);
      return null;
    } finally { busy = false; }
  }

  const timer = setInterval(tick, 60_000);
  if (timer.unref) timer.unref();
  const first = setTimeout(tick, 10_000);
  if (first.unref) first.unref();
  return { stop() { clearInterval(timer); clearTimeout(first); }, tick };
}

module.exports = { buildDigest, digests, runReminders, startReminders, alreadyRan };