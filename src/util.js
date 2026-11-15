'use strict';
const F = require('./finance');

// "1000000", "1 000 000", "1mln", "1.5mln"
function parseAmount(t) {
  const m = String(t).trim().toLowerCase().replace(/\s/g, '').match(/^(\d+(?:[.,]\d+)?)(mln|m)?$/);
  if (!m) return NaN;
  const n = parseFloat(m[1].replace(',', '.'));
  return Math.round(m[2] ? n * 1_000_000 : n);
}

// dd.mm.yyyy | dd/mm/yyyy | dd-mm-yyyy -> Date (mahalliy 00:00) yoki null
function parseDate(t) {
  const m = String(t).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
}

const day = (x) => (x ? new Date(x).toLocaleDateString('ru-RU') : '—');
const dateTime = (x) => new Date(x).toLocaleString('ru-RU');

function receipt(s, p, c) {
  return [
    `CHEK №${p.id}`,
    `Sana: ${dateTime(p.paidAt)}`,
    `O'quvchi: ${s.fullName} (#${s.id}, ${s.category})`,
    `To'landi: ${F.fmt(p.amount)}`,
    `Jami to'langan: ${F.fmt(c.paid)} / ${F.fmt(c.net)}`,
    `Qolgan qarz: ${F.fmt(c.debt)}`,
  ].join('\n');
}

// Telegram 4096 belgi limiti uchun bo'lib yuborish
async function sendLong(ctx, header, lines) {
  let buf = header ? header + '\n' : '';
  for (const l of lines) {
    if (buf.length + l.length + 1 > 3800) { await ctx.reply(buf); buf = ''; }
    buf += l + '\n';
  }
  if (buf.trim()) await ctx.reply(buf);
}

module.exports = { parseAmount, parseDate, day, dateTime, receipt, sendLong };
