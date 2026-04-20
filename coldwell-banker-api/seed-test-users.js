const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seed() {
  try {
    const password = 'admin123'; // Password genérica para testing local
    const hash = await bcrypt.hash(password, 10);

    // Crear Admin
    await prisma.usuario.upsert({
      where: { email: 'admin@coldwellbanker.com.ar' },
      update: {},
      create: {
        nombre: 'Admin',
        email: 'admin@coldwellbanker.com.ar',
        hash: hash,
        rol: 'ADMIN'
      }
    });

    // Crear Nanci (Asesor)
    await prisma.usuario.upsert({
      where: { email: 'nanci.echegoyemberry@coldwellbanker.com.ar' },
      update: {},
      create: {
        nombre: 'Nanci Echegoyemberry',
        email: 'nanci.echegoyemberry@coldwellbanker.com.ar',
        hash: hash,
        rol: 'ASESOR'
      }
    });

    console.log('✅ Usuarios de prueba creados!');
    console.log('Admin -> admin@coldwellbanker.com.ar / admin123');
    console.log('Nanci -> nanci.echegoyemberry@coldwellbanker.com.ar / admin123');

  } catch (error) {
    console.error('Error seeding users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
