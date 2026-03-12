// src/pages/GestionUsuarios.tsx
import { useState, useEffect } from 'react';
import { Plus, UserCog, Trash2, Shield, User, AlertTriangle, Eye, EyeOff, Key, Copy, Check } from 'lucide-react';
import api from '../services/api';
import styles from './GestionUsuarios.module.css';

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'REVISOR' | 'ASESOR';
  createdAt: string;
  password?: string | null;
}

const GestionUsuarios = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<Usuario | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  
  const togglePasswordVisible = (userId: number) => {
    setVisiblePasswords(prev => ({ ...prev, [userId]: !prev[userId] }));
  };
  
  // Estados para cambio de contraseña
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPasswordSuccessModal, setShowPasswordSuccessModal] = useState(false);
  const [usuarioACambiarPassword, setUsuarioACambiarPassword] = useState<Usuario | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [passwordGenerada, setPasswordGenerada] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'ASESOR' as 'ADMIN' | 'REVISOR' | 'ASESOR'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    try {
      const response = await api.get('/usuarios');
      setUsuarios(response.data.usuarios);
    } catch (err: any) {
      setError('Error al cargar usuarios');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await api.post('/usuarios', formData);
      
      // Guardar la contraseña antes de limpiar el formulario
      setPasswordGenerada(formData.password);
      setShowPasswordSuccessModal(true);
      setFormData({ nombre: '', email: '', password: '', rol: 'ASESOR' });
      setShowForm(false);
      cargarUsuarios();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear usuario');
    }
  };

  const iniciarEliminacion = (usuario: Usuario) => {
    setUsuarioAEliminar(usuario);
    setConfirmText('');
    setShowDeleteModal(true);
    setError('');
  };

  const iniciarCambioPassword = (usuario: Usuario) => {
    setUsuarioACambiarPassword(usuario);
    setNuevaPassword('');
    setShowNewPassword(false);
    setShowPasswordModal(true);
    setError('');
  };

  const cambiarPasswordUsuario = async () => {
    if (!usuarioACambiarPassword) return;

    if (!nuevaPassword || nuevaPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      await api.put(`/usuarios/${usuarioACambiarPassword.id}/password`, {
        nuevaPassword
      });
      
      // Guardar la contraseña generada para mostrarla
      setPasswordGenerada(nuevaPassword);
      setShowPasswordModal(false);
      setShowPasswordSuccessModal(true);
      setNuevaPassword('');
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cambiar contraseña');
    }
  };

  const copiarAlPortapapeles = () => {
    navigator.clipboard.writeText(passwordGenerada);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  const confirmarEliminacion = async () => {
    if (!usuarioAEliminar) return;

    const textoValido = confirmText.toLowerCase() === 'borrar' || confirmText.toLowerCase() === 'eliminar';
    
    if (!textoValido) {
      setError('Debes escribir "borrar" o "eliminar" para confirmar');
      return;
    }

    try {
      await api.delete(`/usuarios/${usuarioAEliminar.id}`);
      setSuccess(`✅ Usuario ${usuarioAEliminar.nombre} eliminado exitosamente`);
      setShowDeleteModal(false);
      setUsuarioAEliminar(null);
      setConfirmText('');
      cargarUsuarios();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al eliminar usuario');
    }
  };

  const getRolIcon = (rol: string) => {
    switch (rol) {
      case 'ADMIN':
        return <Shield size={18} color="#00AEEF" />;
      case 'REVISOR':
        return <UserCog size={18} color="#7C3AED" />;
      default:
        return <User size={18} color="#64748b" />;
    }
  };

  const getRolLabel = (rol: string) => {
    switch (rol) {
      case 'ADMIN':
        return 'Administrador';
      case 'REVISOR':
        return 'Revisor';
      default:
        return 'Asesor';
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando usuarios...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Gestión de Usuarios</h1>
        <button 
          className={styles.btnPrimary}
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={20} />
          Nuevo Usuario
        </button>
      </div>

      {error && (
        <div className={styles.alert} data-type="error">
          {error}
        </div>
      )}
      
      {success && (
        <div className={styles.alert} data-type="success">
          {success}
        </div>
      )}

      {showForm && (
        <div className={styles.formCard}>
          <h2>Crear Nuevo Usuario</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Nombre Completo</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Juan Pérez"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="juan@cbdelaveracruz.com"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Contraseña</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className={styles.togglePassword}
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Rol</label>
              <select
                value={formData.rol}
                onChange={(e) => setFormData({ ...formData, rol: e.target.value as any })}
              >
                <option value="ASESOR">Asesor</option>
                <option value="REVISOR">Revisor</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>

            <div className={styles.formActions}>
              <button type="button" onClick={() => setShowForm(false)} className={styles.btnSecondary}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary}>
                Crear Usuario
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>NOMBRE</th>
              <th>EMAIL</th>
              <th>ROL</th>
              <th>CONTRASEÑA</th>
              <th>FECHA DE CREACIÓN</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td>{usuario.nombre}</td>
                <td>{usuario.email}</td>
                <td>
                  <div className={styles.rolBadge}>
                    {getRolIcon(usuario.rol)}
                    <span>{getRolLabel(usuario.rol)}</span>
                  </div>
                </td>
                <td>
                  <div className={styles.passwordCell}>
                    {usuario.password ? (
                      <>
                        <span className={styles.passwordValue}>
                          {visiblePasswords[usuario.id] ? usuario.password : '••••••••'}
                        </span>
                        <button
                          className={styles.btnTogglePass}
                          onClick={() => togglePasswordVisible(usuario.id)}
                          title={visiblePasswords[usuario.id] ? 'Ocultar' : 'Mostrar'}
                        >
                          {visiblePasswords[usuario.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </>
                    ) : (
                      <span className={styles.noPassword}>No disponible</span>
                    )}
                  </div>
                </td>
                <td>{new Date(usuario.createdAt).toLocaleDateString('es-AR')}</td>
                <td>
                  <div className={styles.actionButtons}>
                    <button
                      className={styles.btnChangePassword}
                      onClick={() => iniciarCambioPassword(usuario)}
                      title="Cambiar contraseña"
                    >
                      <Key size={18} />
                    </button>
                    <button
                      className={styles.btnDelete}
                      onClick={() => iniciarEliminacion(usuario)}
                      title="Eliminar usuario"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal para cambiar contraseña */}
      {showPasswordModal && usuarioACambiarPassword && (
        <div className={styles.modalOverlay} onClick={() => setShowPasswordModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <Key size={48} color="#00AEEF" />
              <h2>Cambiar Contraseña</h2>
            </div>
            
            <p className={styles.modalText}>
              Usuario: <strong>{usuarioACambiarPassword.nombre}</strong>
            </p>

            <div className={styles.formGroup}>
              <label>Nueva Contraseña</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.togglePassword}
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  title={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && <p className={styles.errorText}>{error}</p>}

            <div className={styles.modalActions}>
              <button 
                onClick={() => {
                  setShowPasswordModal(false);
                  setNuevaPassword('');
                  setError('');
                }}
                className={styles.btnSecondary}
              >
                Cancelar
              </button>
              <button 
                onClick={cambiarPasswordUsuario}
                className={styles.btnPrimary}
                disabled={!nuevaPassword || nuevaPassword.length < 6}
              >
                Cambiar Contraseña
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de éxito - Mostrar contraseña generada */}
      {showPasswordSuccessModal && (
        <div className={styles.modalOverlay} onClick={() => {
          setShowPasswordSuccessModal(false);
          setPasswordGenerada('');
          setCopied(false);
        }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <Check size={48} color="#10b981" />
              <h2>Contraseña Actualizada</h2>
            </div>
            
            <p className={styles.modalText}>
              La contraseña ha sido actualizada exitosamente.
            </p>

            <div className={styles.passwordDisplay}>
              <label>Nueva Contraseña:</label>
              <div className={styles.passwordBox}>
                <code className={styles.passwordCode}>{passwordGenerada}</code>
                <button
                  onClick={copiarAlPortapapeles}
                  className={styles.btnCopy}
                  title="Copiar al portapapeles"
                >
                  {copied ? <Check size={20} color="#10b981" /> : <Copy size={20} />}
                </button>
              </div>
            </div>

            <div className={styles.warningBox}>
              <AlertTriangle size={20} color="#f59e0b" />
              <p>
                <strong>Importante:</strong> Copiá esta contraseña ahora. 
                Por seguridad, no podrás verla nuevamente una vez cerrado este mensaje.
              </p>
            </div>

            <div className={styles.modalActions}>
              <button 
                onClick={() => {
                  setShowPasswordSuccessModal(false);
                  setPasswordGenerada('');
                  setCopied(false);
                }}
                className={styles.btnPrimary}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteModal && usuarioAEliminar && (
        <div className={styles.modalOverlay} onClick={() => setShowDeleteModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <AlertTriangle size={48} color="#ef4444" />
              <h2>Confirmar Eliminación</h2>
            </div>
            
            <p className={styles.modalText}>
              Estás a punto de eliminar al usuario <strong>{usuarioAEliminar.nombre}</strong> ({usuarioAEliminar.email}).
            </p>
            
            <p className={styles.modalWarning}>
             Esta acción es permanente y no se puede deshacer.
            </p>

            <div className={styles.formGroup}>
              <label>Escribe "borrar" o "eliminar" para confirmar:</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="borrar o eliminar"
                autoFocus
              />
            </div>

            <div className={styles.modalActions}>
              <button 
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmText('');
                  setError('');
                }}
                className={styles.btnSecondary}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmarEliminacion}
                className={styles.btnDanger}
                disabled={!confirmText}
              >
                Eliminar Usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionUsuarios;
