'use strict';
// Migratsiya ishlamagan bo'lsa ham yangi jadvallar yaratilib qoladi (bir necha marta ishlatish xavfsiz).
// Jadval tuzilishi prisma/schema.prisma dagi Expense modeli bilan bir xil.
const SQL = [
  `CREATE TABLE IF NOT EXISTS "Expense" (
    "id" SERIAL NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" BIGINT,
    "cancelReason" TEXT,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Expense_spentAt_idx" ON "Expense"("spentAt")`,
];

async function ensureSchema(prisma) {
  if (!prisma || typeof prisma.$executeRawUnsafe !== 'function') return;
  for (const q of SQL) await prisma.$executeRawUnsafe(q);
  console.log('Baza: jadvallar tekshirildi');
}

module.exports = { ensureSchema };