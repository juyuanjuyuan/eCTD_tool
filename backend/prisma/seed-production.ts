/**
 * Production database seed script.
 * Seeds essential data: admin user, CTD templates, controlled vocabularies.
 * Run: npx ts-node prisma/seed-production.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting production seed...');

  // 1. Create admin user if not exists
  const adminExists = await prisma.user.findUnique({
    where: { email: 'admin@ectd.local' },
  });

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123!@#', 10);
    await prisma.user.create({
      data: {
        email: 'admin@ectd.local',
        passwordHash: hashedPassword,
        name: '系统管理员',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log('Admin user created (admin@ectd.local). Please change password after first login.');
  } else {
    console.log('Admin user already exists, skipping.');
  }

  // 2. CTD templates are seeded via CtdTemplateModule's onModuleInit
  // 3. Controlled vocabularies are seeded via ControlledVocabularyService's onModuleInit
  // These run automatically when the application starts.

  console.log('Production seed completed.');
  console.log('Note: CTD templates and controlled vocabularies are auto-seeded on app startup.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
