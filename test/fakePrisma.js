// Sinov uchun xotiradagi soxta Prisma (haqiqiy bazasiz)
// Soxta (in-memory) Prisma bilan bot oqimlarini sinash
const Module = require("module");
const db = { tariff: [], student: [], payment: [], instructor: [], group: [], audit: [] };
const nid = { student: 1, payment: 1, instructor: 1, group: 1, audit: 1 };
const M = 1_000_000;
db.tariff = [
  { category: 'B', total: 5.5 * M, extStage1: M, extStage2: M, instructorShare: 0.5 * M },
  { category: 'BC', total: 7.2 * M, extStage1: M, extStage2: 2.5 * M, instructorShare: M },
];
function m(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return v.some((w) => m(row, w));
    if (k === 'student') return m(db.student.find((s) => s.id === row.studentId), v);
    const val = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(val);
      if ('contains' in v) return val != null && String(val).toLowerCase().includes(String(v.contains).toLowerCase());
      if ('lte' in v || 'gte' in v || 'lt' in v) {
        return (v.lte === undefined || val <= v.lte) && (v.gte === undefined || val >= v.gte) && (v.lt === undefined || val < v.lt);
      }
    }
    return (val === undefined ? null : val) === v;
  });
}
function inc(kind, row, include) {
  const r = { ...row };
  if (kind === 'student') {
    if (include && include.payments) r.payments = db.payment.filter((p) => p.studentId === row.id);
    if (include && include.group) r.group = db.group.find((g) => g.id === row.groupId) || null;
    if (include && include.instructor) r.instructor = db.instructor.find((i) => i.id === row.instructorId) || null;
  }
  return r;
}
const tbl = (name, defaults = () => ({})) => ({
  findFirst: async ({ where, include }) => { const r = db[name].find((x) => m(x, where)); return r ? inc(name, r, include) : null; },
  findMany: async ({ where, include, take, orderBy } = {}) => {
    let l = db[name].filter((x) => m(x, where));
    if (orderBy && orderBy.fullName) l.sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (orderBy && orderBy.deadline) l.sort((a, b) => a.deadline - b.deadline);
    if (take) l = l.slice(0, take);
    return l.map((x) => inc(name, x, include));
  },
  findUnique: async ({ where }) => { const [k, v] = Object.entries(where)[0]; const r = db[name].find((x) => x[k] === v); return r ? { ...r } : null; },
  create: async ({ data }) => { const r = { id: nid[name]++, ...defaults(), ...data }; db[name].push(r); return { ...r }; },
  update: async ({ where, data, include }) => {
    const r = db[name].find((x) => x.id === where.id);
    for (const [k, v] of Object.entries(data)) r[k] = v && v.increment !== undefined ? r[k] + v.increment : v;
    return inc(name, r, include);
  },
});
const fake = {
  tariff: { findUnique: async ({ where }) => db.tariff.find((t) => t.category === where.category) || null },
  student: { ...tbl('student', () => ({ status: 'ACTIVE', discount: 0, docApproved: false, externalTransferred: 0, instructorPaid: false, deletedAt: null, startDate: null, endDate: null, groupId: null, instructorId: null, phone2: null })),
    updateMany: async ({ where, data }) => { const rows = db.student.filter((x) => m(x, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; } },
  payment: { ...tbl('payment', () => ({ status: 'ACTIVE', paidAt: new Date(), note: null })),
    aggregate: async ({ where }) => ({ _sum: { amount: db.payment.filter((p) => m(p, where)).reduce((a, p) => a + p.amount, 0) } }) },
  instructor: { ...tbl('instructor', () => ({ active: true })),
    findMany: async () => db.instructor.map((i) => ({ ...i, students: db.student.filter((s) => s.instructorId === i.id && !s.deletedAt) })) },
  group: { ...tbl('group'), findMany: async () => db.group.map((g) => ({ ...g, _count: { students: db.student.filter((s) => s.groupId === g.id && !s.deletedAt).length } })) },
  auditLog: { create: async ({ data }) => { db.audit.push(data); return data; }, createMany: async ({ data }) => { db.audit.push(...data); return { count: data.length }; } },
  $transaction: async (fn) => fn(fake),
  $disconnect: async () => {},
};
const orig = Module._load;
Module._load = function (req, ...a) { return req === '@prisma/client' ? { PrismaClient: function () { return fake; } } : orig.call(this, req, ...a); };

module.exports = { db, fake };
