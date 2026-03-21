import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@ectd.com' },
    update: {},
    create: {
      email: 'admin@ectd.com',
      passwordHash: adminPassword,
      name: '系统管理员',
      role: 'ADMIN',
    },
  });

  // Create test editor user
  const editorPassword = await bcrypt.hash('editor123', 10);
  await prisma.user.upsert({
    where: { email: 'editor@ectd.com' },
    update: {},
    create: {
      email: 'editor@ectd.com',
      passwordHash: editorPassword,
      name: '测试编辑',
      role: 'EDITOR',
    },
  });

  // Create test manager user
  const managerPassword = await bcrypt.hash('manager123', 10);
  await prisma.user.upsert({
    where: { email: 'manager@ectd.com' },
    update: {},
    create: {
      email: 'manager@ectd.com',
      passwordHash: managerPassword,
      name: '测试经理',
      role: 'MANAGER',
    },
  });

  console.log('Seed completed.');
  console.log('Default users:');
  console.log('  admin@ectd.com / admin123 (ADMIN)');
  console.log('  manager@ectd.com / manager123 (MANAGER)');
  console.log('  editor@ectd.com / editor123 (EDITOR)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
