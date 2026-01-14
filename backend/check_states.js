
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const states = await prisma.state.findMany();
  console.log('States:', states);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
