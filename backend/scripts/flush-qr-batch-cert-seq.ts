import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function flushQrBatchCertSeq() {
  console.log('Starting flush for Certificates, QR Codes, Batches, Sequences');
  try {
    console.log('- Deleting Certificates...');
    const certDel = await prisma.certificate.deleteMany({});
    console.log(`  Deleted Certificates: ${certDel.count}`);

    console.log('- Deleting QR Codes...');
    const qrDel = await prisma.qRCode.deleteMany({});
    console.log(`  Deleted QR Codes: ${qrDel.count}`);

    console.log('- Deleting Batches...');
    const batchDel = await prisma.batch.deleteMany({});
    console.log(`  Deleted Batches: ${batchDel.count}`);

    console.log('- Deleting Sequences...');
    const seqDel = await prisma.sequence.deleteMany({});
    console.log(`  Deleted Sequences: ${seqDel.count}`);

    // Clean generated files under uploads (preserve OEM logos)
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    console.log('- Cleaning generated files in uploads...');
    if (fs.existsSync(uploadsRoot)) {
      const entries = fs.readdirSync(uploadsRoot, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.name;
        const fullPath = path.join(uploadsRoot, name);
        // Preserve OEM logos folder
        if (name.toLowerCase() === 'oems') continue;
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`  Removed: ${name}`);
        } catch (e) {
          console.warn(`  Failed to remove ${name}: ${(e as any)?.message || e}`);
        }
      }
    } else {
      console.log('  uploads folder does not exist, nothing to clean.');
    }

    console.log('Flush complete.');
  } catch (e) {
    console.error('Flush failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

flushQrBatchCertSeq();
