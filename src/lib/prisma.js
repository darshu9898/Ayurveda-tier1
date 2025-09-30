// src/lib/prisma.js - Fixed with proper connection handling
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

// Create Prisma Client with connection pooling
const createPrismaClient = () => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    errorFormat: 'minimal',
  });

  // Connect immediately in development
  if (process.env.NODE_ENV === 'development') {
    client.$connect()
      .then(() => console.log('✅ Prisma connected'))
      .catch((err) => console.error('❌ Prisma connection failed:', err));
  }

  return client;
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Ensure connection before queries
export async function ensureConnected() {
  try {
    await prisma.$connect();
    return true;
  } catch (error) {
    console.error('Failed to connect to database:', error);
    return false;
  }
}

// Graceful shutdown
if (process.env.NODE_ENV !== 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

export default prisma;