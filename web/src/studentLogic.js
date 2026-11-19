// O'quvchilar ro'yxati uchun sof funksiyalar (qidiruv, filtr, saralash, statistika, holat).
// Moliyaviy hisob serverda (src/finance.js); bu yerda faqat tayyor maydonlar ishlatiladi.

export const STATUS_FILTERS = [['all', 'Hammasi'], ['grouped', 'Guruhli'], ['ungrouped', 'Guruhsiz'], ['debtors', 'Qarzdor'], ['paid', "To'liq to'lagan"]];
export const SORTS = [
  ['newest', 'Yangi o\'quvchilar'], ['oldest', 'Eski o\'quvchilar'],
  ['debt-desc', 'Qarz: ko\'pdan kamga'], ['debt-asc', 'Qarz: kamdan ko\'pga'], ['name', 'Ism: A–Z'],
];

// paid | overdue | due | partial | unpaid
export function payState(s, now = new Date()) {
  if (s.debt <= 0) return 'paid';
  if (s.deadline && new Date(s.deadline) < now) return 'overdue';
  if (s.dueNow > 0) return 'due';
  if (s.paid > 0) return 'partial';
  return 'unpaid';
}

export const STATE_INFO = {
  paid: { label: "To'liq to'langan", tone: 'green' },
  overdue: { label: "Muddati o'tgan", tone: 'red' },
  due: { label: "Muddatli qarz", tone: 'red' },
  partial: { label: "Qisman to'langan", tone: 'blue' },
  unpaid: { label: "To'lanmagan", tone: 'red' },
};

export const paidPercent = (s) => (s.net > 0 ? Math.max(0, Math.min(100, Math.round((s.paid / s.net) * 100))) : 100);

export function matchesQuery(s, q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return true;
  if (/^#\d+$/.test(q)) return s.id === parseInt(q.slice(1), 10);
  if (/^[\d\s+\-()]+$/.test(q)) {
    const dg = q.replace(/\D/g, '');
    if (dg.length < 3) return String(s.id) === dg;
    const tail = dg.length > 9 ? dg.slice(-9) : dg;
    return [s.phone, s.phone2].some((p) => p && String(p).includes(tail));
  }
  return s.fullName.toLowerCase().includes(q);
}

export function applyFilters(list, { q = '', status = 'all', category = 'all', group = 'all', sort = 'newest' } = {}) {
  let r = list.filter((s) => {
    if (!matchesQuery(s, q)) return false;
    if (status === 'grouped' && !s.group) return false;
    if (status === 'ungrouped' && s.group) return false;
    if (status === 'debtors' && !(s.debt > 0)) return false;
    if (status === 'paid' && s.debt > 0) return false;
    if (category !== 'all' && s.category !== category) return false;
    if (group !== 'all' && !(s.group && String(s.group.id) === String(group))) return false;
    return true;
  });
  const t = (x) => new Date(x.registeredAt).getTime() || 0;
  const cmp = {
    newest: (a, b) => t(b) - t(a) || b.id - a.id,
    oldest: (a, b) => t(a) - t(b) || a.id - b.id,
    'debt-desc': (a, b) => b.debt - a.debt,
    'debt-asc': (a, b) => a.debt - b.debt,
    name: (a, b) => a.fullName.localeCompare(b.fullName, 'uz'),
  }[sort] || (() => 0);
  return r.sort(cmp);
}

export function computeStats(list) {
  let debtors = 0, paid = 0, debt = 0;
  for (const s of list) {
    if (s.debt > 0) { debtors++; debt += s.debt; } else paid++;
  }
  return { total: list.length, debtors, paid, debt };
}

export function statusCounts(list) {
  return {
    all: list.length,
    grouped: list.filter((s) => s.group).length,
    ungrouped: list.filter((s) => !s.group).length,
    debtors: list.filter((s) => s.debt > 0).length,
    paid: list.filter((s) => s.debt <= 0).length,
  };
}
