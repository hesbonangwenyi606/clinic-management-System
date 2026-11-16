import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.CMS_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.CMS_BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password || password.length < 14) {
    throw new Error(
      'Set CMS_BOOTSTRAP_ADMIN_EMAIL and a unique CMS_BOOTSTRAP_ADMIN_PASSWORD of at least 14 characters before seeding.',
    );
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      firstName: 'Clinic',
      lastName: 'Administrator',
      role: UserRole.SUPER_ADMIN,
    },
  });
  console.log(`Bootstrap administrator is ready: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error('Unable to seed the bootstrap administrator.', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
