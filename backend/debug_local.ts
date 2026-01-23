
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to database...');
  try {
    // 1. Check System Settings
    console.log('Checking System Settings...');
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'SYSTEM_SETTINGS' } });
    console.log('System Settings:', settings ? 'Found' : 'Not Found');

    // 2. Check Dealers
    console.log('Fetching Dealers...');
    const dealers = await prisma.dealer.findMany({
        take: 5,
        include: {
            state: true,
            rto: true,
            oems: true
        }
    });
    console.log(`Found ${dealers.length} dealers.`);
    if (dealers.length > 0) {
        console.log('First dealer:', dealers[0].name);
    }

    // 3. Check Users
    console.log('Fetching Users...');
    const users = await prisma.user.findMany({ take: 5 });
    console.log(`Found ${users.length} users.`);

    // 4. Test Login Logic (Simulated)
    const phone = '8888320669'; // Example
    const dealer = await prisma.dealer.findUnique({ where: { phone } });
    if (dealer) {
        console.log(`Found dealer by phone ${phone}. Status: ${dealer.status}`);
        // Test bcrypt
        // const isMatch = await bcrypt.compare('123456', dealer.password);
        // console.log('Password match for 123456:', isMatch);
    } else {
        console.log(`Dealer with phone ${phone} not found.`);
    }

  } catch (e) {
    console.error('ERROR OCCURRED:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
