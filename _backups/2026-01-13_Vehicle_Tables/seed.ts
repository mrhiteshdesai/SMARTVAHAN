import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const phone = '8888320669';
  const password = '123456';
  const hashedPassword = await bcrypt.hash(password, 10);

  const superAdmin = await prisma.user.upsert({
    where: { phone },
    update: {
      password: hashedPassword, // Ensure password is updated if user exists
    },
    create: {
      name: 'Super Admin',
      phone,
      email: 'admin@smartvahan.com',
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log({ superAdmin });

  // Seed Products
  const products = [
    { code: 'C3', name: 'Class 3' },
    { code: 'C4', name: 'Class 4' },
    { code: 'CT', name: 'CT' },
    { code: 'CTAUTO', name: 'CT Auto' },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code,
        name: p.name,
      },
    });
  }
  console.log('Products seeded');

  // Seed Vehicle Manufacturers
  const manufacturers = [
    'Ashok Leyland',
    'Atul Auto Ltd',
    'Audi',
    'Bajaj Auto Ltd',
    'BMW India',
    'BYD India',
    'Eicher',
    'Honda',
    'Hyundai',
    'Jaguar',
    'Kia',
    'Lamborghini',
    'Land Rover',
    'Mahindra',
    'Maruti Suzuki',
    'Mercedes-Benz',
    'MINI',
    'Nissan',
    'Piaggio',
    'Porsche',
    'Renault',
    'Škoda',
    'Swaraj',
    'Swaraj Mazda',
    'Switch Mobility',
    'Tata Motors Ltd',
    'Tata Daewoo',
    'Toyota',
    'VinFast',
    'Volkswagen',
    'Volvo',
  ];

  for (const name of manufacturers) {
    await prisma.vehicleManufacturer.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Vehicle Manufacturers seeded');

  // Seed Vehicle Categories
  const categories = [
    'HMV/HCV',
    'LMV/LCV',
    'MCV',
    '3 Wheeler',
    'Ambulance',
    'Bus',
    'Cab',
    'Fire Tender',
    'Goods Carriers',
    'Mobile crane',
    'Tempo',
    'Tow truck',
    'Trailer',
    'Truck',
  ];

  for (const name of categories) {
    await prisma.vehicleCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Vehicle Categories seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
