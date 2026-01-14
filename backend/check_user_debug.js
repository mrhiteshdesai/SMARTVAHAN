
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function checkUser() {
    const phone = '8888320669';
    const pass = '123456';

    console.log(`Checking for user: ${phone}`);

    // Check User table
    const user = await prisma.user.findUnique({ where: { phone } });
    if (user) {
        console.log('Found in User table:', user);
        const match = await bcrypt.compare(pass, user.password);
        console.log('Password match:', match);
    } else {
        console.log('Not found in User table');
    }

    // Check Dealer table
    const dealer = await prisma.dealer.findUnique({ where: { phone } });
    if (dealer) {
        console.log('Found in Dealer table:', dealer);
        const match = await bcrypt.compare(pass, dealer.password);
        console.log('Password match:', match);
    } else {
        console.log('Not found in Dealer table');
    }
}

checkUser()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
