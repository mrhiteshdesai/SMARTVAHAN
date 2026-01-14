import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function flush() {
  console.log('Starting data flush for: State, RTOs, OEM, Dealer, Batches, QR Codes');
  try {
    // Order matters due to FK constraints
    console.log('- Deleting QR Codes...');
    const qrDel = await prisma.qRCode.deleteMany({});
    console.log(`  Deleted QR Codes: ${qrDel.count}`);

    console.log('- Deleting Batches...');
    const batchDel = await prisma.batch.deleteMany({});
    console.log(`  Deleted Batches: ${batchDel.count}`);

    console.log('- Deleting Dealers...');
    const dealerDel = await prisma.dealer.deleteMany({});
    console.log(`  Deleted Dealers: ${dealerDel.count}`);

    console.log('- Deleting OEMs...');
    const oemDel = await prisma.oEM.deleteMany({});
    console.log(`  Deleted OEMs: ${oemDel.count}`);

    console.log('- Deleting RTOs...');
    const rtoDel = await prisma.rTO.deleteMany({});
    console.log(`  Deleted RTOs: ${rtoDel.count}`);

    console.log('- Deleting States...');
    const stateDel = await prisma.state.deleteMany({});
    console.log(`  Deleted States: ${stateDel.count}`);

    console.log('Flush complete.');
  } catch (e) {
    console.error('Flush failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

flush();

