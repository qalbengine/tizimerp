// Davr tanlash: kun / hafta / oy / hammasi. Sana formati YYYY-MM-DD, "to" oxirgi kundan keyingi kun.
export const MODES = [['day', 'Kun'], ['week', 'Hafta'], ['month', 'Oy'], ['all', 'Hammasi']];
export const BYS = [['day', 'Kunlik'], ['week', 'Haftalik'], ['month', 'Oylik']];
export const DEFAULT_BY = { day: 'day', week: 'day', month: 'week', all: 'month' };
export const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dm = (d) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function range(mode, anchor = new Date()) {
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (mode === 'day') return { from: ymd(a), to: ymd(addDays(a, 1)), label: `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}` };
  if (mode === 'week') {
    const mon = addDays(a, -((a.getDay() + 6) % 7)); const sun = addDays(mon, 6);
    return { from: ymd(mon), to: ymd(addDays(mon, 7)), label: `${dm(mon)} – ${dm(sun)}.${sun.getFullYear()}` };
  }
  if (mode === 'month') {
    const f = new Date(a.getFullYear(), a.getMonth(), 1); const n = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { from: ymd(f), to: ymd(n), label: `${cap(MONTHS[f.getMonth()])} ${f.getFullYear()}` };
  }
  return { from: '2000-01-01', to: '2100-01-01', label: 'Barcha vaqt' };
}

export function shift(mode, anchor, dir) {
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (mode === 'day') return addDays(a, dir);
  if (mode === 'week') return addDays(a, 7 * dir);
  if (mode === 'month') return new Date(a.getFullYear(), a.getMonth() + dir, 1);
  return a;
}

// Qator nomi: kun "16.11", hafta "10.11 – 16.11", oy "Noyabr 2026"
export function bucketLabel(key, by) {
  const [y, m, d] = key.split('-').map(Number);
  if (by === 'month') return `${cap(MONTHS[m - 1])} ${y}`;
  const s = new Date(y, m - 1, d);
  if (by === 'week') return `${dm(s)} – ${dm(addDays(s, 6))}`;
  return `${p2(d)}.${p2(m)}.${y}`;
}
