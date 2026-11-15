const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const M = 1_000_000;

const TARIFFS = [
  { category: 'B',  total: 5.5 * M, extStage1: 1 * M, extStage2: 1 * M,   instructorShare: 0.5 * M },
  { category: 'BC', total: 7.2 * M, extStage1: 1 * M, extStage2: 2.5 * M, instructorShare: 1.0 * M },
  { category: 'C',  total: 3.5 * M, extStage1: 1 * M, extStage2: 1 * M,   instructorShare: 0.5 * M },
  { category: 'E',  total: 3.5 * M, extStage1: 1 * M, extStage2: 1 * M,   instructorShare: 0.5 * M },
];

(async () => {
  for (const t of TARIFFS) {
    await prisma.tariff.upsert({ where: { category: t.category }, update: t, create: t });
  }
  console.log('Tariflar yozildi');
})().finally(() => prisma.$disconnect());
