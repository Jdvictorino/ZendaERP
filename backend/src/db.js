import { PrismaClient } from '@prisma/client';
import { QUANTITY_FIELDS, resultExtension } from './services/quantityFields.js';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
}).$extends(resultExtension(QUANTITY_FIELDS));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
