import { Router } from 'express';
import { 
  listarExpedientes, 
  obtenerExpediente, 
  crearExpediente, 
  actualizarExpediente,
  cambiarEstadoExpediente,
  marcarObservacionesVistas,
  eliminarExpediente,
  enviarARevision,
  marcarDocumentoVisto,
  obtenerHistorial
} from '../controllers/expedientes.controller';
import { generarMandatoCompleto } from '../controllers/mandatos-completo.controller';
import { autenticar, esAdmin, esAdminORevisor } from '../middlewares/auth.middleware';

const router = Router();

/**
 * GET /expedientes
 * Lista expedientes con filtros y paginación
 * Requiere autenticación
 * Query params:
 * - estado: PENDIENTE | APROBADO | RECHAZADO
 * - asesorId: number
 * - desde/hasta: fechas ISO
 * - q: búsqueda en título o propietario
 * - page: número de página (default: 1)
 * - limit: registros por página (default: 10, max: 100)
 */
router.get('/', autenticar, listarExpedientes);

/**
 * GET /expedientes/:id
 * Obtiene un expediente por ID
 * Requiere autenticación
 */
router.get('/:id', autenticar, obtenerExpediente);

/**
 * POST /expedientes
 * Crea un nuevo expediente
 * Requiere autenticación
 * El usuarioId se toma del token (req.usuario.id)
 */
router.post('/', autenticar, crearExpediente);


/**
 * PUT /expedientes/:id
 * Actualizar un expediente (EN_PREPARACION o PENDIENTE)
 * - ASESOR: Solo puede editar sus propias propiedades EN_PREPARACION o PENDIENTES
 * - ADMIN/REVISOR: Pueden editar cualquier propiedad EN_PREPARACION o PENDIENTE
 */
router.put('/:id', autenticar, actualizarExpediente);

/**
 * PUT /expedientes/:id/estado
 * PATCH /expedientes/:id/estado (alias para mobile)
 * Cambia el estado de un expediente (APROBAR/RECHAZAR)
 * Requiere autenticación y rol ADMIN o REVISOR
 * Body: { estado: "PENDIENTE" | "APROBADO" | "RECHAZADO" }
 */
router.put('/:id/estado', autenticar, esAdminORevisor, cambiarEstadoExpediente);
router.patch('/:id/estado', autenticar, esAdminORevisor, cambiarEstadoExpediente);

/**
 * PUT /expedientes/:id/observaciones-vistas
 * Marca las observaciones como vistas por el asesor
 */
router.put('/:id/observaciones-vistas', autenticar, marcarObservacionesVistas);

/**
 * PUT /expedientes/:id/enviar-revision
 * Envía la propiedad a revisión (cambia de EN_PREPARACION a PENDIENTE)
 * Solo el asesor dueño puede hacerlo
 * Requiere al menos 1 documento cargado
 */
router.put('/:id/enviar-revision', autenticar, enviarARevision);

/**
 * POST /documentos/:id/marcar-visto
 * Marca un documento como visto por el usuario actual
 * Todos los usuarios autenticados pueden marcar sus propios vistos
 */
router.post('/documentos/:id/marcar-visto', autenticar, marcarDocumentoVisto);

/**
 * GET /propiedades/:id/mandato/word-completo
 * Genera mandato Word con datos autocompletados
 * Requiere autenticación
 */
router.get('/:id/mandato/word-completo', autenticar, generarMandatoCompleto);

/**
 * DELETE /expedientes/:id
 * Eliminar expediente (solo ADMIN)
 */
router.delete('/:id', autenticar, esAdmin, eliminarExpediente);

/**
 * GET /expedientes/:id/historial
 * Obtiene el historial de cambios de una propiedad
 * Requiere autenticación
 */
router.get('/:id/historial', autenticar, obtenerHistorial);

export default router;
