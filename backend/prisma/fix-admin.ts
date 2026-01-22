import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const phone = '8888320669';
  const password = '123456';
  const hashedPassword = await bcrypt.hash(password, 10);

  const existingUser = await prisma.user.findUnique({
    where: { phone },
  });

  if (existingUser) {
    console.log(`User ${phone} exists. Updating password...`);
    await prisma.user.update({
      where: { phone },
      data: {
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        name: 'Super Admin',
      },
    });
    console.log(`User ${phone} updated successfully.`);
  } else {
    console.log(`User ${phone} does not exist. Creating...`);
    await prisma.user.create({
      data: {
        phone,
        password: hashedPassword,
        name: 'Super Admin',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    console.log(`User ${phone} created successfully.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
