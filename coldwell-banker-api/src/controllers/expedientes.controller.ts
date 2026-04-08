import { Request, Response } from 'express';
import prisma from '../prisma';
import * as fs from 'fs';
import * as path from 'path';
const ESTADOS_PERMITIDOS = ['EN_PREPARACION', 'PENDIENTE', 'APROBADO', 'RECHAZADO'] as const;
type EstadoExpediente = typeof ESTADOS_PERMITIDOS[number];

/**
 * GET /expedientes
 * Lista expedientes con filtros y paginación
 * Query params:
 * - estado: PENDIENTE | APROBADO | RECHAZADO
 * - asesorId: number
 * - desde: fecha ISO (createdAt >=)
 * - hasta: fecha ISO (createdAt <=)
 * - q: texto para buscar en titulo o propietarioNombre
 * - page: número de página (default: 1)
 * - limit: registros por página (default: 10)
 */
export const listarExpedientes = async (req: Request, res: Response) => {
    try {
        // Obtener query params
        const {
            estado,
            asesorId,
            desde,
            hasta,
            q,
            page = '1',
            limit = '10'
        } = req.query;

        // Validar y parsear paginación
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);

        if (isNaN(pageNum) || pageNum < 1) {
            res.status(400).json({
                error: 'El parámetro "page" debe ser un número mayor a 0'
            });
            return;
        }

        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            res.status(400).json({
                error: 'El parámetro "limit" debe ser un número entre 1 y 100'
            });
            return;
        }

        // Validar estado si viene
        if (estado && !ESTADOS_PERMITIDOS.includes(estado as EstadoExpediente)) {
            res.status(400).json({
                error: `Estado inválido. Estados permitidos: ${ESTADOS_PERMITIDOS.join(', ')}`
            });
            return;
        }

        // Validar asesorId si viene
        let asesorIdNum: number | undefined;
        if (asesorId) {
            asesorIdNum = parseInt(asesorId as string);
            if (isNaN(asesorIdNum)) {
                res.status(400).json({
                    error: 'El parámetro "asesorId" debe ser un número válido'
                });
                return;
            }
        }
        // Validar fechas si vienen
        let desdeDate: Date | undefined;
        let hastaDate: Date | undefined;
        if (desde) {
            desdeDate = new Date(desde as string);
            if (isNaN(desdeDate.getTime())) {
                res.status(400).json({
                    error: 'El parámetro "desde" debe ser una fecha válida en formato ISO'
                });
                return;
            }
        }
        if (hasta) {
            hastaDate = new Date(hasta as string);
            if (isNaN(hastaDate.getTime())) {
                res.status(400).json({
                    error: 'El parámetro "hasta" debe ser una fecha válida en formato ISO'
                });
                return;
            }
        }
        // SEGURIDAD: Obtener usuario autenticado y validar autorización
        const usuario = req.usuario;
        if (!usuario) {
            res.status(401).json({
                error: 'Usuario no autenticado'
            });
            return;
        }
        // Construir filtros para Prisma
        const where: any = {};
        // SEGURIDAD: Si es ASESOR, FORZAR filtro por su propio ID
        if (usuario.rol === 'ASESOR') {
            where.asesorId = usuario.id;

            // Si intentó filtrar por otro asesor, rechazar la petición
            if (asesorIdNum && asesorIdNum !== usuario.id) {
                res.status(403).json({
                    error: 'No tienes permisos para filtrar por otros asesores'
                });
                return;
            }
        } else {
            // ADMIN y REVISOR pueden filtrar por cualquier asesorId
            if (asesorIdNum) {
                where.asesorId = asesorIdNum;
            }
        }
        // RESTRICCIÓN REVISOR: no puede ver propiedades EN_PREPARACION
        // Solo ve las que ya fueron enviadas a revisión (PENDIENTE, APROBADO, RECHAZADO)
        if (usuario.rol === 'REVISOR') {
            where.estado = { not: 'EN_PREPARACION' };
        }
        // Filtro por estado (sobrescribe el filtro de REVISOR si se pasa estado explícito,
        // pero REVISOR nunca debería pasar EN_PREPARACION desde el frontend)
        if (estado) {
            where.estado = estado;
        }

        // Filtro por rango de fechas
        if (desdeDate || hastaDate) {
            where.createdAt = {};
            if (desdeDate) {
                where.createdAt.gte = desdeDate;
            }
            if (hastaDate) {
                where.createdAt.lte = hastaDate;
            }
        }

        // Filtro por búsqueda de texto (titulo o propietarioNombre)
        if (q) {
            where.OR = [
                {
                    titulo: {
                        contains: q as string,
                        mode: 'insensitive' // Búsqueda case-insensitive
                    }
                },
                {
                    propietarioNombre: {
                        contains: q as string,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        // Calcular skip para paginación
        const skip = (pageNum - 1) * limitNum;

        // Obtener total de registros que coinciden con el filtro
        const total = await prisma.expediente.count({ where });

        // Obtener expedientes con filtros y paginación
        const expedientes = await prisma.expediente.findMany({
            where,
            include: {
                asesor: {
                    select: {
                        id: true,
                        nombre: true,
                        email: true,
                        rol: true
                        // NO incluimos el hash
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take: limitNum
        });

        // Calcular total de páginas
        const totalPages = Math.ceil(total / limitNum);

        res.json({
            data: expedientes,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages
            },
            filters: {
                estado: estado || null,
                asesorId: asesorIdNum || null,
                desde: desde || null,
                hasta: hasta || null,
                q: q || null
            }
        });
    } catch (error) {
        console.error('Error al listar expedientes:', error);
        res.status(500).json({
            error: 'Error interno del servidor al listar expedientes'
        });
    }
};

/**
 * GET /expedientes/:id
 * Obtiene un expediente por ID
 * 
 * Permisos:
 * - ASESOR: Solo puede ver sus propios expedientes (filtrado por asesorId)
 * - REVISOR/ADMIN: Pueden ver todos los expedientes
 */
export const obtenerExpediente = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const expedienteId = parseInt(id);

        // Validar que el ID sea un número válido
        if (isNaN(expedienteId)) {
            res.status(400).json({
                error: 'ID de expediente inválido'
            });
            return;
        }

        // Obtener el usuario autenticado
        const usuario = req.usuario;

        if (!usuario) {
            res.status(401).json({
                error: 'Usuario no autenticado'
            });
            return;
        }

        // Construir el where según el rol
        const where: any = { id: expedienteId };

        // Si es ASESOR, solo puede ver sus propios expedientes
        if (usuario.rol === 'ASESOR') {
            where.asesorId = usuario.id;
        }
        // ADMIN y REVISOR pueden ver todos los expedientes (no se agrega filtro adicional)

        // Buscar el expediente con todas las relaciones
        const expediente = await prisma.expediente.findUnique({
            where,
            include: {
                asesor: {
                    select: {
                        id: true,
                        nombre: true,
                        email: true,
                        rol: true
                    }
                },
                documentos: {
                    include: {
                        vistos: {
                            where: { usuarioId: usuario.id }, // Solo los vistos por este usuario
                            select: { visto: true }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                mandato: true  // Incluir el mandato completo (null si no existe)
            }
        });

        if (!expediente) {
            // Si no se encuentra, puede ser que:
            // 1. El expediente no existe
            // 2. El ASESOR está intentando ver un expediente que no es suyo
            res.status(404).json({
                error: 'Expediente no encontrado o no tienes permisos para verlo'
            });
            return;
        }

        res.json(expediente);
    } catch (error) {
        console.error('Error al obtener expediente:', error);
        res.status(500).json({
            error: 'Error interno del servidor al obtener el expediente'
        });
    }
};

/**
 * POST /expedientes (y /propiedades como alias)
 * Crea un nuevo expediente/propiedad
 * El usuarioId se toma del token (req.usuario.id)
 * 
 * Campos requeridos:
 * - titulo: string (nombre de la propiedad)
 * - propietarioNombre: string (nombre del dueño)
 * 
 * Campos opcionales:
 * - descripcion: string
 * - direccion: string
 * - api: string (número de API)
 * - emails: string (emails separados por coma)
 */
export const crearExpediente = async (req: Request, res: Response) => {
    try {
        const { 
            titulo, 
            tipoPropiedad,
            descripcion, 
            propietarioNombre, 
            direccion, 
            api, 
            partidaInmobiliaria,
            localidad,
            emails,
            propietarios 
        } = req.body;

        // Validación: el título es obligatorio
        if (!titulo || titulo.trim() === '') {
            res.status(400).json({
                error: 'El campo "titulo" es obligatorio'
            });
            return;
        }

        // Validación: tipoPropiedad es obligatorio (nuevo campo)
        if (!tipoPropiedad || tipoPropiedad.trim() === '') {
            res.status(400).json({
                error: 'El campo "tipoPropiedad" es obligatorio'
            });
            return;
        }

        // Obtener el usuarioId del token (lo pone el middleware autenticar)
        const usuarioId = req.usuario?.id;

        if (!usuarioId) {
            res.status(401).json({
                error: 'Usuario no autenticado'
            });
            return;
        }

        // Auto-poblar propietarioNombre desde el array de propietarios
        let propietarioNombreAuto = propietarioNombre?.trim() || null;
        
        if (propietarios && Array.isArray(propietarios) && propietarios.length > 0) {
            // Extraer nombres de todos los propietarios
            const nombres = propietarios
                .map((p: any) => p.nombreCompleto)
                .filter((nombre: string) => nombre && nombre.trim())
                .join(', ');
            
            if (nombres) {
                propietarioNombreAuto = nombres;
            }
        }

        // Crear el expediente con los nuevos campos
        // @ts-ignore - Los tipos de Prisma se actualizan al reiniciar VS Code
        const nuevoExpediente = await prisma.expediente.create({
            data: {
                titulo: titulo.trim(),
                tipoPropiedad: tipoPropiedad?.trim() || null,
                descripcion: descripcion?.trim() || null,
                propietarioNombre: propietarioNombreAuto, // Auto-populado desde array
                direccion: direccion && direccion.trim() ? direccion.trim() : null,
                api: api && api.trim() ? api.trim() : null,
                partidaInmobiliaria: partidaInmobiliaria && partidaInmobiliaria.trim() ? partidaInmobiliaria.trim() : null,
                localidad: localidad && localidad.trim() ? localidad.trim() : null,
                emails: emails && emails.trim() ? emails.trim() : null,
                propietarios: propietarios ? JSON.stringify(propietarios) : null, // Serializar como JSON string
                asesorId: usuarioId
                // estado por defecto es PENDIENTE (definido en el schema)
            },
            include: {
                asesor: {
                    select: {
                        id: true,
                        nombre: true,
                        email: true,
                        rol: true
                    }
                }
            }
        });

        // Registrar en historial
        await prisma.historialCambio.create({
            data: {
                expedienteId: nuevoExpediente.id,
                usuarioId: usuarioId,
                accion: 'CREACION',
                detalle: `Creó la propiedad "${titulo.trim()}"`,
                estadoNuevo: 'EN_PREPARACION'
            }
        });

        res.status(201).json({
            mensaje: 'Expediente creado exitosamente',
            expediente: nuevoExpediente
        });
    } catch (error) {
        console.error('Error al crear expediente:', error);
        res.status(500).json({
            error: 'Error interno del servidor al crear el expediente'
        });
    }
};

/**
 * PUT /expedientes/:id/estado
 * Cambia el estado de un expediente (solo ADMIN)
 * Body: { 
 *   estado: "PENDIENTE" | "APROBADO" | "RECHAZADO",
 *   observaciones?: string
 * }
 * - Si el nuevo estado es RECHAZADO, las observaciones son obligatorias
 * - Si el nuevo estado es APROBADO, se limpian las observaciones anteriores
 */
export const cambiarEstadoExpediente = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { estado, observaciones } = req.body;
        const expedienteId = parseInt(id);

        // Validar ID
        if (isNaN(expedienteId)) {
            res.status(400).json({
                error: 'ID de expediente inválido'
            });
            return;
        }

        // Validar que venga el estado
        if (!estado) {
            res.status(400).json({
                error: 'El campo "estado" es obligatorio'
            });
            return;
        }

        // Validar que el estado sea uno de los permitidos
        if (!ESTADOS_PERMITIDOS.includes(estado as EstadoExpediente)) {
            res.status(400).json({
                error: `Estado inválido. Estados permitidos: ${ESTADOS_PERMITIDOS.join(', ')}`
            });
            return;
        }

        // Validar observaciones según el estado
        if (estado === 'RECHAZADO') {
            // Si se rechaza, las observaciones son OBLIGATORIAS
            if (!observaciones || observaciones.trim() === '') {
                res.status(400).json({
                    error: 'Las observaciones son obligatorias cuando el estado es RECHAZADO'
                });
                return;
            }
        }

        // Verificar que el expediente existe
        const expedienteExistente = await prisma.expediente.findUnique({
            where: { id: expedienteId }
        });

        if (!expedienteExistente) {
            res.status(404).json({
                error: 'Expediente no encontrado'
            });
            return;
        }

        // Preparar los datos para actualizar
        const datosActualizacion: any = {
            estado
        };

        // Si el estado es RECHAZADO, guardar las observaciones
        if (estado === 'RECHAZADO') {
            datosActualizacion.observaciones = observaciones.trim();
        }
        // Si el estado es APROBADO, limpiar las observaciones
        else if (estado === 'APROBADO') {
            datosActualizacion.observaciones = null;
        }
        // Si el estado es PENDIENTE, mantener las observaciones si vienen
        else if (estado === 'PENDIENTE' && observaciones) {
            datosActualizacion.observaciones = observaciones.trim();
        }

        // Actualizar el estado y las observaciones
        const expedienteActualizado = await prisma.expediente.update({
            where: { id: expedienteId },
            data: datosActualizacion,
            include: {
                asesor: {
                    select: {
                        id: true,
                        nombre: true,
                        email: true,
                        rol: true
                    }
                }
            }
        });

        // Registrar cambio de estado en historial
        const estadoAnterior = expedienteExistente.estado;
        let detalleHistorial = `Cambió estado de ${estadoAnterior} a ${estado}`;
        if (estado === 'RECHAZADO' && observaciones) {
            detalleHistorial += `. Observaciones: ${observaciones.trim()}`;
        }
        await prisma.historialCambio.create({
            data: {
                expedienteId,
                usuarioId: req.usuario!.id,
                accion: 'CAMBIO_ESTADO',
                detalle: detalleHistorial,
                estadoAnterior,
                estadoNuevo: estado
            }
        });

        res.json({
            mensaje: 'Estado del expediente actualizado exitosamente',
            expediente: expedienteActualizado
        });
    } catch (error) {
        console.error('Error al cambiar estado del expediente:', error);
        res.status(500).json({
            error: 'Error interno del servidor al cambiar el estado del expediente'
        });
    }
};

/**
 * Marca las observaciones como vistas (solo el asesor dueño puede hacerlo)
 */
export const marcarObservacionesVistas = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expedienteId = parseInt(id);
    const userId = req.usuario?.id;

    if (isNaN(expedienteId)) {
      res.status(400).json({ error: 'ID de expediente inválido' });
      return;
    }

    // Buscar expediente
    const expediente = await prisma.expediente.findUnique({
      where: { id: expedienteId },
      select: { id: true, asesorId: true }
    });

    if (!expediente) {
      res.status(404).json({ error: 'Expediente no encontrado' });
      return;
    }

    // Solo el asesor dueño puede marcar como vistas
    if (expediente.asesorId !== userId) {
      res.status(403).json({ error: 'No tienes permiso para marcar estas observaciones' });
      return;
    }

    // Marcar como vistas
    await prisma.expediente.update({
      where: { id: expedienteId },
      data: { observacionesVistas: true }
    });

    res.json({ mensaje: 'Observaciones marcadas como vistas' });
  } catch (error) {
    console.error('Error al marcar observaciones:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Elimina un expediente (solo ADMIN)
 */
export const eliminarExpediente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expedienteId = parseInt(id);

    if (isNaN(expedienteId)) {
      res.status(400).json({ error: 'ID de expediente inválido' });
      return;
    }

    // Buscar expediente con documentos y mandato
    const expediente = await prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        documentos: true,
        mandato: true
      }
    });

    if (!expediente) {
      res.status(404).json({ error: 'Expediente no encontrado' });
      return;
    }

    // 🔒 Prevenir path traversal: validar que las rutas estén dentro de uploads
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    
    // Eliminar archivos de documentos
    for (const doc of expediente.documentos) {
      try {
        // 🔒 Prevenir path traversal: validar que la ruta esté dentro de uploads
        const filePath = path.resolve(uploadsDir, doc.rutaArchivo);
        
        // Verificar que la ruta normalizada esté dentro del directorio permitido
        if (!filePath.startsWith(uploadsDir + path.sep) && filePath !== uploadsDir) {
          console.error(`⚠️ Path traversal attempt detected: ${doc.rutaArchivo}`);
          continue;
        }
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileError) {
        console.error(`Error al eliminar archivo ${doc.rutaArchivo}:`, fileError instanceof Error ? fileError.message : 'Unknown error');
        // Continuar incluso si falla la eliminación de un archivo
      }
    }

    // Eliminar archivo de mandato
    if (expediente.mandato?.documentoUrl) {
      try {
        // 🔒 Prevenir path traversal: validar que la ruta esté dentro de uploads
        const mandatoPath = path.resolve(uploadsDir, expediente.mandato.documentoUrl);
        
        // Verificar que la ruta normalizada esté dentro del directorio permitido
        if (!mandatoPath.startsWith(uploadsDir + path.sep) && mandatoPath !== uploadsDir) {
          console.error(`⚠️ Path traversal attempt detected in mandato: ${expediente.mandato.documentoUrl}`);
        } else if (fs.existsSync(mandatoPath)) {
          fs.unlinkSync(mandatoPath);
        }
      } catch (fileError) {
        console.error(`Error al eliminar mandato:`, fileError instanceof Error ? fileError.message : 'Unknown error');
      }
    }

    // Eliminar expediente (Prisma eliminará documentos y mandato en cascada)
    await prisma.expediente.delete({
      where: { id: expedienteId }
    });

    res.json({ mensaje: 'Expediente eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar expediente:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * PUT /expedientes/:id/enviar-revision
 * Cambia estado de EN_PREPARACION a PENDIENTE (envía a revisión del corredor)
 * Solo el asesor dueño puede hacerlo
 * Requiere al menos 1 documento cargado
 */
export const enviarARevision = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expedienteId = parseInt(id);
    const userId = req.usuario?.id;

    if (isNaN(expedienteId)) {
      res.status(400).json({ error: 'ID de expediente inválido' });
      return;
    }

    // Buscar expediente con documentos
    const expediente = await prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: { documentos: true }
    });

    if (!expediente) {
      res.status(404).json({ error: 'Expediente no encontrado' });
      return;
    }

    // Solo el asesor dueño puede enviar
    if (expediente.asesorId !== userId) {
      res.status(403).json({ error: 'No tienes permiso para enviar esta propiedad' });
      return;
    }

    // Solo se puede enviar si está EN_PREPARACION o RECHAZADO
    if (expediente.estado !== 'EN_PREPARACION' && expediente.estado !== 'RECHAZADO') {
      res.status(400).json({ 
        error: 'Solo se pueden enviar propiedades que están en preparación o rechazadas' 
      });
      return;
    }

    // Validar que tenga al menos 1 documento
    if (expediente.documentos.length === 0) {
      res.status(400).json({ 
        error: 'Debes cargar al menos 1 documento antes de enviar la propiedad a revisión' 
      });
      return;
    }

    // Cambiar estado a PENDIENTE
    const expedienteActualizado = await prisma.expediente.update({
      where: { id: expedienteId },
      data: { estado: 'PENDIENTE' },
      include: {
        asesor: {
          select: { id: true, nombre: true, email: true }
        },
        documentos: true,
        mandato: true
      }
    });

    // Registrar en historial
    await prisma.historialCambio.create({
        data: {
            expedienteId,
            usuarioId: userId!,
            accion: 'ENVIO_REVISION',
            detalle: 'Envió la propiedad a revisión',
            estadoAnterior: expediente.estado,
            estadoNuevo: 'PENDIENTE'
        }
    });

    res.json({ 
      mensaje: 'Propiedad enviada a revisión exitosamente',
      expediente: expedienteActualizado 
    });
  } catch (error) {
    console.error('Error al enviar a revisión:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
/**
 * POST /documentos/:id/marcar-visto
 * Marca un documento como visto por el usuario actual
 * Disponible para todos los usuarios autenticados
 */
export const marcarDocumentoVisto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentoId = parseInt(id);
    const userId = req.usuario?.id;

    if (isNaN(documentoId)) {
      res.status(400).json({ error: 'ID de documento inválido' });
      return;
    }

    // Verificar que el documento existe
    const documento = await prisma.documento.findUnique({
      where: { id: documentoId }
    });

    if (!documento) {
      res.status(404).json({ error: 'Documento no encontrado' });
      return;
    }

    // Crear o actualizar registro (upsert para evitar duplicados)
    await prisma.documentoVisto.upsert({
      where: {
        documentoId_usuarioId: {
          documentoId,
          usuarioId: userId!
        }
      },
      update: {
        visto: new Date() // Actualizar timestamp si ya existía
      },
      create: {
        documentoId,
        usuarioId: userId!
      }
    });

    res.json({ mensaje: 'Documento marcado como visto' });
  } catch (error) {
    console.error('Error al marcar documento:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /expedientes/:id/historial
 * Obtiene el historial de cambios de un expediente
 * Disponible para todos los usuarios autenticados
 */
export const obtenerHistorial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expedienteId = parseInt(id);

    if (isNaN(expedienteId)) {
      res.status(400).json({ error: 'ID de expediente inválido' });
      return;
    }

    const historial = await prisma.historialCambio.findMany({
      where: { expedienteId },
      include: {
        usuario: {
          select: { id: true, nombre: true, rol: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      expedienteId,
      total: historial.length,
      historial
    });
  } catch (error) {
    console.error('Error al obtener historial:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * PUT /expedientes/:id
 * Actualiza los datos de un expediente
 *
 * Permisos:
 * - ASESOR: Solo puede editar sus propias propiedades en estado EN_PREPARACION o PENDIENTE
 * - ADMIN/REVISOR: Pueden editar cualquier propiedad PENDIENTE
 */
export const actualizarExpediente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expedienteId = parseInt(id);
    const usuario = req.usuario;

    if (isNaN(expedienteId)) {
      res.status(400).json({ error: 'ID de expediente inválido' });
      return;
    }

    if (!usuario) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    // Buscar el expediente existente
    const expedienteExistente = await prisma.expediente.findUnique({
      where: { id: expedienteId }
    });

    if (!expedienteExistente) {
      res.status(404).json({ error: 'Expediente no encontrado' });
      return;
    }

    // Verificar permisos:
    // ASESOR: solo sus propias propiedades EN_PREPARACION, PENDIENTE o RECHAZADO
    if (usuario.rol === 'ASESOR') {
      if (expedienteExistente.asesorId !== usuario.id) {
        res.status(403).json({ error: 'No tienes permiso para editar esta propiedad' });
        return;
      }
      if (expedienteExistente.estado !== 'EN_PREPARACION' && expedienteExistente.estado !== 'PENDIENTE' && expedienteExistente.estado !== 'RECHAZADO') {
        res.status(400).json({ error: 'Solo puedes editar propiedades en preparación, pendientes o rechazadas' });
        return;
      }
    }

    // ADMIN/REVISOR: solo propiedades PENDIENTE (no APROBADO ni RECHAZADO)
    if (usuario.rol === 'ADMIN' || usuario.rol === 'REVISOR') {
      if (expedienteExistente.estado !== 'EN_PREPARACION' && expedienteExistente.estado !== 'PENDIENTE') {
        res.status(400).json({ error: 'No se pueden editar propiedades aprobadas o rechazadas' });
        return;
      }
    }

    const {
      titulo,
      tipoPropiedad,
      descripcion,
      direccion,
      partidaInmobiliaria,
      localidad,
      emails,
      propietarios
    } = req.body;

    // Validar título si viene
    if (titulo !== undefined && (!titulo || titulo.trim() === '')) {
      res.status(400).json({ error: 'El campo "titulo" no puede estar vacío' });
      return;
    }

    // Validar tipoPropiedad si viene
    if (tipoPropiedad !== undefined && (!tipoPropiedad || tipoPropiedad.trim() === '')) {
      res.status(400).json({ error: 'El campo "tipoPropiedad" no puede estar vacío' });
      return;
    }

    // Auto-actualizar propietarioNombre desde el array de propietarios
    let propietarioNombreAuto = expedienteExistente.propietarioNombre;
    if (propietarios && Array.isArray(propietarios) && propietarios.length > 0) {
      const nombres = propietarios
        .map((p: any) => p.nombreCompleto)
        .filter((nombre: string) => nombre && nombre.trim())
        .join(', ');
      if (nombres) {
        propietarioNombreAuto = nombres;
      }
    }

    // Construir object de actualización
    const datosActualizacion: any = {};
    if (titulo !== undefined) datosActualizacion.titulo = titulo.trim();
    if (tipoPropiedad !== undefined) datosActualizacion.tipoPropiedad = tipoPropiedad.trim();
    if (descripcion !== undefined) datosActualizacion.descripcion = descripcion?.trim() || null;
    if (direccion !== undefined) datosActualizacion.direccion = direccion?.trim() || null;
    if (partidaInmobiliaria !== undefined) datosActualizacion.partidaInmobiliaria = partidaInmobiliaria?.trim() || null;
    if (localidad !== undefined) datosActualizacion.localidad = localidad?.trim() || null;
    if (emails !== undefined) datosActualizacion.emails = emails?.trim() || null;
    if (propietarios !== undefined) {
      datosActualizacion.propietarios = propietarios ? JSON.stringify(propietarios) : null;
      datosActualizacion.propietarioNombre = propietarioNombreAuto;
    }

    const expedienteActualizado = await prisma.expediente.update({
      where: { id: expedienteId },
      data: datosActualizacion,
      include: {
        asesor: {
          select: { id: true, nombre: true, email: true, rol: true }
        }
      }
    });

    // Registrar en historial
    await prisma.historialCambio.create({
      data: {
        expedienteId,
        usuarioId: usuario.id,
        accion: 'EDICION',
        detalle: `Editó los datos de la propiedad "${expedienteActualizado.titulo}"`,
        estadoNuevo: expedienteActualizado.estado
      }
    });

    res.json({
      mensaje: 'Expediente actualizado exitosamente',
      expediente: expedienteActualizado
    });
  } catch (error) {
    console.error('Error al actualizar expediente:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Error interno del servidor al actualizar el expediente' });
  }
};
