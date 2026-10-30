import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = Array.from({ length: 10 }, (_, index) => ({
    email: `user${index + 1}@example.com`,
    name: `Test User ${index + 1}`,
  }));

  const result = await prisma.user.createMany({
    data: users,
    skipDuplicates: true,
  });

  console.log(`${result.count} users created.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
