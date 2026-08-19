import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.cashShift.updateMany({
    where: { status: 'open', openingAmount: 1000000 },
    data: { openingAmount: 0 }
  });
  console.log('Updated Shifts:', result.count);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
