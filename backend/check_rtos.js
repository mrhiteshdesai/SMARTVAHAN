
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const stateCode = 'CG';
  console.log(`Fetching RTOs for state: ${stateCode}`);
  const rtos = await prisma.rTO.findMany({
    where: {
      stateCode: stateCode,
    },
  });
  console.log('RTOs found:', rtos);
  
  const allRtos = await prisma.rTO.findMany();
  console.log('Total RTOs:', allRtos.length);
  
  const cgRtos = allRtos.filter(r => r.stateCode === 'CG');
  console.log('RTOs with stateCode "CG" (filtered in JS):', cgRtos);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
