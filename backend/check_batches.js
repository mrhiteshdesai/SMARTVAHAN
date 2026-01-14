const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBatches() {
  const batches = await prisma.batch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('Last 5 Batches:');
  batches.forEach(b => {
    console.log(`Batch ${b.batchId}: ${b.startSerial} to ${b.endSerial} (Status: ${b.status})`);
  });
}

checkBatches()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
