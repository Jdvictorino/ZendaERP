import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const openShifts = await prisma.cashShift.findMany({
    where: { status: 'open' }
  });
  console.log('Open Shifts:', JSON.stringify(openShifts, null, 2));

  const count = await prisma.invoice.count();
  console.log('Total Invoices:', count);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
