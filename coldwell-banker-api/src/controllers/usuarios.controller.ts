import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma';

/**
 * POST /usuarios
 * Crea un nuevo usuario con password hasheado
 */
export const crearUsuario = async (req: Request, res: Response) => {
try {
    const { nombre, email, password, rol } = req.body;

    // Validar que vengan los datos requeridos
    if (!nombre || !email || !password) {
    res.status(400).json({ 
        error: 'Faltan campos requeridos: nombre, email, password' 
    });
    return;
    }

    // Verificar que el email no exista
    const usuarioExistente = await prisma.usuario.findUnique({
    where: { email }
    });

    if (usuarioExistente) {
    res.status(409).json({ 
        error: 'El email ya está registrado' 
    });
    return;
    }

    // Hashear el password con bcrypt (10 rounds)
    const hash = await bcrypt.hash(password, 10);

    // Crear el usuario en la base de datos
    const nuevoUsuario = await prisma.usuario.create({
    data: {
        nombre,
        email,
        hash,
        password, // ⚠️ Guardar password en texto plano para que ADMIN pueda verla
        rol: rol || 'ASESOR' // Por defecto ASESOR si no se especifica
    },
    select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        createdAt: true
        // NO devolvemos el hash
    }
    });

    res.status(201).json({
    mensaje: 'Usuario creado exitosamente',
    usuario: nuevoUsuario
    });
} catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ 
    error: 'Error interno del servidor' 
    });
}
};

/**
 * GET /usuarios
 * Obtiene la lista de todos los usuarios (solo ADMIN)
 */
export const obtenerUsuarios = async (req: Request, res: Response) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        password: true, // ⚠️ Password en texto plano, solo para ADMIN
        createdAt: true
        // NO devolvemos el hash
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      usuarios
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

/**
 * DELETE /usuarios/:id
 * Elimina un usuario por ID (solo ADMIN)
 */
export const eliminarUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      res.status(400).json({ 
        error: 'ID de usuario inválido' 
      });
      return;
    }

    // Verificar que el usuario existe
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: { expedientes: true }
        }
      }
    });

    if (!usuario) {
      res.status(404).json({ 
        error: 'Usuario no encontrado' 
      });
      return;
    }

    // No permitir eliminar si tiene expedientes asignados
    if (usuario._count.expedientes > 0) {
      res.status(409).json({ 
        error: `No se puede eliminar al usuario porque tiene ${usuario._count.expedientes} expediente(s) asignado(s). Reasigná los expedientes primero.`
      });
      return;
    }

    // Eliminar el usuario
    await prisma.usuario.delete({
      where: { id: userId }
    });

    res.json({
      mensaje: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};


/**
 * PUT /usuarios/:id/password
 * Cambia la contraseña de un usuario (solo ADMIN)
 */
export const cambiarPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nuevaPassword } = req.body;
    const userId = parseInt(id);

    // Validar ID
    if (isNaN(userId)) {
      res.status(400).json({ 
        error: 'ID de usuario inválido' 
      });
      return;
    }

    // Validar que venga la nueva contraseña
    if (!nuevaPassword) {
      res.status(400).json({ 
        error: 'La nueva contraseña es requerida' 
      });
      return;
    }

    // Validar longitud mínima
    if (nuevaPassword.length < 6) {
      res.status(400).json({ 
        error: 'La contraseña debe tener al menos 6 caracteres' 
      });
      return;
    }

    // Verificar que el usuario existe
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId }
    });

    if (!usuario) {
      res.status(404).json({ 
        error: 'Usuario no encontrado' 
      });
      return;
    }

    // Hashear la nueva contraseña
    const nuevoHash = await bcrypt.hash(nuevaPassword, 10);

    // Actualizar la contraseña
    await prisma.usuario.update({
      where: { id: userId },
      data: { 
        hash: nuevoHash,
        password: nuevaPassword // ⚠️ Actualizar password en texto plano
      }
    });

    res.json({
      mensaje: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

/**
 * GET /usuarios/:id/password
 * Obtiene la contraseña de un usuario (solo ADMIN)
 */
export const obtenerPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);

    // Validar ID
    if (isNaN(userId)) {
      res.status(400).json({ 
        error: 'ID de usuario inválido' 
      });
      return;
    }

    // Buscar usuario
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { 
        password: true, 
        nombre: true,
        email: true
      }
    });

    if (!usuario) {
      res.status(404).json({ 
        error: 'Usuario no encontrado' 
      });
      return;
    }

    // Si no tiene password guardada (usuarios antiguos)
    if (!usuario.password) {
      res.status(404).json({ 
        error: 'Contraseña no disponible. Este usuario fue creado antes de habilitar esta funcionalidad.' 
      });
      return;
    }

    res.json({
      password: usuario.password,
      usuario: {
        nombre: usuario.nombre,
        email: usuario.email
      }
    });
  } catch (error) {
    console.error('Error al obtener contraseña:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

