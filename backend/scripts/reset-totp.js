import prisma from '../src/db.js';

await prisma.platformSecurity.upsert({
  where: { id: 1 },
  update: { totpSecret: null, totpConfirmedAt: null, lastTotpStep: -1 },
  create: { id: 1 },
});
console.log('Segundo factor reiniciado');
await prisma.$disconnect();
