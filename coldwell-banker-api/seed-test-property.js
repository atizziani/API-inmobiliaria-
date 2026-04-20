const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedProperty() {
  try {
    // Buscar a Nanci
    const nanci = await prisma.usuario.findUnique({
      where: { email: 'nanci.echegoyemberry@coldwellbanker.com.ar' }
    });

    if (!nanci) {
      console.error('No se encontró a Nanci');
      return;
    }

    // Crear una propiedad de prueba
    const property = await prisma.expediente.create({
      data: {
        titulo: 'CASA SANTO TOME (Prueba Local)',
        direccion: 'PASAJE OROÑO 2300',
        localidad: '3000 - Santa Fe. SANTO TOME',
        partidaInmobiliaria: '1012001421220010103',
        estado: 'PENDIENTE',
        asesorId: nanci.id,
        propietarioNombre: 'PROENZA NICOLAS, maria viviana castiglioni',
        documentos: {
          create: [
            {
              tipo: 'OTRO',
              nombre: 'Escritura (1).pdf',
              rutaArchivo: 'uploads/propiedades/test/escritura.pdf'
            }
          ]
        }
      }
    });

    console.log('✅ Propiedad de prueba creada para Nanci!');
    console.log('ID Propiedad:', property.id);

  } catch (error) {
    console.error('Error seeding property:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedProperty();
