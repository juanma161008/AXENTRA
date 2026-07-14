import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, Pencil, PlusCircle, Trash2, UserPlus, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { empresaApi, normalizeApiError, roleApi, userApi } from '../../api/api';
import { getInitials } from '../../utils/workspace';

const emptyCreateForm = {
  email: '',
  nombre: '',
  apellido: '',
  telefono: '',
  cargo: '',
  password: '',
  rolesIds: [],
};

const AdminUsuarios = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);

  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const [resettingUser, setResettingUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [empresaToAssign, setEmpresaToAssign] = useState('');
  const [rolToAssign, setRolToAssign] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, rolesRes, companiesRes] = await Promise.all([
        userApi.list({ limit: 200 }),
        roleApi.list(),
        empresaApi.list({ activo: true }),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
      setCompanies(Array.isArray(companiesRes.data) ? companiesRes.data : []);
    } catch (err) {
      setError(normalizeApiError(err, 'No fue posible cargar los usuarios'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rolesById = useMemo(() => new Map(roles.map((rol) => [rol.id, rol])), [roles]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!createForm.email.trim() || !createForm.nombre.trim() || !createForm.apellido.trim() || !createForm.password) {
      toast.error('Completa los campos obligatorios');
      return;
    }

    setCreating(true);
    try {
      await userApi.create({
        email: createForm.email.trim(),
        nombre: createForm.nombre.trim(),
        apellido: createForm.apellido.trim(),
        telefono: createForm.telefono.trim() || null,
        cargo: createForm.cargo.trim() || null,
        password: createForm.password,
        roles_ids: createForm.rolesIds,
      });
      toast.success('Usuario creado');
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      await load();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible crear el usuario'));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      telefono: user.telefono || '',
      cargo: user.cargo || '',
      activo: user.activo,
    });
    setEmpresaToAssign('');
    setRolToAssign('');
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    try {
      await userApi.update(editingUser.id, editForm);
      toast.success('Usuario actualizado');
      await load();
      setEditingUser(null);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar el usuario'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (user) => {
    try {
      await userApi.update(user.id, { activo: !user.activo });
      toast.success(user.activo ? 'Usuario desactivado' : 'Usuario activado');
      await load();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible cambiar el estado'));
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`¿Eliminar a ${user.nombre} ${user.apellido}? Esta acción no se puede deshacer.`)) return;

    try {
      await userApi.remove(user.id);
      toast.success('Usuario eliminado');
      await load();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar el usuario'));
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!resettingUser || newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setResetting(true);
    try {
      await userApi.resetPassword(resettingUser.id, newPassword);
      toast.success('Contraseña restablecida');
      setResettingUser(null);
      setNewPassword('');
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible restablecer la contraseña'));
    } finally {
      setResetting(false);
    }
  };

  const handleToggleGlobalRole = async (user, rolId, hasRole) => {
    try {
      if (hasRole) {
        await userApi.removeRole(user.id, rolId);
      } else {
        await userApi.assignRole(user.id, rolId);
      }
      await load();
      setEditingUser((current) => (current?.id === user.id ? users.find((item) => item.id === user.id) : current));
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar el rol'));
    }
  };

  const handleAssignEmpresa = async () => {
    if (!editingUser || !empresaToAssign || !rolToAssign) return;

    try {
      await userApi.assignEmpresa(editingUser.id, empresaToAssign, rolToAssign);
      toast.success('Empresa asignada');
      setEmpresaToAssign('');
      setRolToAssign('');
      await load();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible asignar la empresa'));
    }
  };

  const handleRemoveEmpresa = async (empresaId) => {
    if (!editingUser) return;
    try {
      await userApi.removeEmpresa(editingUser.id, empresaId);
      toast.success('Empresa removida');
      await load();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible remover la empresa'));
    }
  };

  const editingUserFresh = editingUser ? users.find((item) => item.id === editingUser.id) || editingUser : null;

  return (
    <section className="adm-section">
      <div className="adm-section__header">
        <div>
          <h2>Usuarios</h2>
          <p>Crea usuarios, restablece contraseñas y asigna roles/empresas.</p>
        </div>
        <button className="btn btn--primary" type="button" onClick={() => setCreateOpen(true)}>
          <UserPlus size={16} />
          Nuevo usuario
        </button>
      </div>

      {error ? <div className="adm-alert">{error}</div> : null}

      {loading ? (
        <div className="adm-loading">
          <Loader2 size={20} className="spin" />
          <span>Cargando usuarios...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="adm-empty">
          <Users size={26} />
          <h3>Sin usuarios todavía</h3>
        </div>
      ) : (
        <div className="adm-table">
          {users.map((user) => (
            <div key={user.id} className="adm-row">
              <div className="adm-row__avatar">{getInitials(`${user.nombre} ${user.apellido}`)}</div>
              <div className="adm-row__main">
                <strong>{user.nombre} {user.apellido}</strong>
                <span>{user.email}</span>
              </div>
              <div className="adm-row__tags">
                {(user.roles || []).map((rol) => (
                  <span key={rol} className="status-chip status-chip--primary">{rol}</span>
                ))}
                <span className={`status-chip status-chip--${user.activo ? 'success' : 'neutral'}`}>
                  {user.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="adm-row__actions">
                <button className="icon-btn icon-btn--ghost" type="button" onClick={() => openEdit(user)} title="Editar">
                  <Pencil size={15} />
                </button>
                <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setResettingUser(user)} title="Resetear contraseña">
                  <KeyRound size={15} />
                </button>
                <button className="icon-btn icon-btn--ghost" type="button" onClick={() => handleDelete(user)} title="Eliminar">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setCreateOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <h3>Nuevo usuario</h3>
                <p>Se le asigna acceso inmediato con la contraseña que definas.</p>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              <form className="adm-form" onSubmit={handleCreate}>
                <div className="field-grid field-grid--2">
                  <label className="field">
                    <span className="field__label">Nombre *</span>
                    <input value={createForm.nombre} onChange={(e) => setCreateForm((f) => ({ ...f, nombre: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field__label">Apellido *</span>
                    <input value={createForm.apellido} onChange={(e) => setCreateForm((f) => ({ ...f, apellido: e.target.value }))} />
                  </label>
                </div>

                <label className="field">
                  <span className="field__label">Email *</span>
                  <input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
                </label>

                <div className="field-grid field-grid--2">
                  <label className="field">
                    <span className="field__label">Teléfono</span>
                    <input value={createForm.telefono} onChange={(e) => setCreateForm((f) => ({ ...f, telefono: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field__label">Cargo</span>
                    <input value={createForm.cargo} onChange={(e) => setCreateForm((f) => ({ ...f, cargo: e.target.value }))} />
                  </label>
                </div>

                <label className="field">
                  <span className="field__label">Contraseña *</span>
                  <input type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
                </label>

                <div className="field">
                  <span className="field__label">Roles iniciales</span>
                  <div className="adm-row__tags">
                    {roles.map((rol) => {
                      const checked = createForm.rolesIds.includes(rol.id);
                      return (
                        <button
                          type="button"
                          key={rol.id}
                          className={`status-chip status-chip--${checked ? 'primary' : 'neutral'}`}
                          onClick={() =>
                            setCreateForm((f) => ({
                              ...f,
                              rolesIds: checked ? f.rolesIds.filter((id) => id !== rol.id) : [...f.rolesIds, rol.id],
                            }))
                          }
                        >
                          {rol.nombre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="adm-form__footer">
                  <button className="btn btn--ghost" type="button" onClick={() => setCreateOpen(false)}>Cancelar</button>
                  <button className="btn btn--primary" type="submit" disabled={creating}>
                    {creating ? 'Creando...' : 'Crear usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {editingUserFresh && editForm ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setEditingUser(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <h3>{editingUserFresh.nombre} {editingUserFresh.apellido}</h3>
                <p>Editar datos, roles y empresas asignadas.</p>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setEditingUser(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              <form className="adm-form" onSubmit={handleSaveEdit}>
                <div className="field-grid field-grid--2">
                  <label className="field">
                    <span className="field__label">Nombre</span>
                    <input value={editForm.nombre} onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field__label">Apellido</span>
                    <input value={editForm.apellido} onChange={(e) => setEditForm((f) => ({ ...f, apellido: e.target.value }))} />
                  </label>
                </div>

                <label className="field">
                  <span className="field__label">Email</span>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                </label>

                <div className="field-grid field-grid--2">
                  <label className="field">
                    <span className="field__label">Teléfono</span>
                    <input value={editForm.telefono} onChange={(e) => setEditForm((f) => ({ ...f, telefono: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field__label">Cargo</span>
                    <input value={editForm.cargo} onChange={(e) => setEditForm((f) => ({ ...f, cargo: e.target.value }))} />
                  </label>
                </div>

                <label className="field field--toggle">
                  <span className="field__label">Estado</span>
                  <button
                    type="button"
                    className={`switch ${editForm.activo ? 'switch--active' : ''}`}
                    onClick={() => setEditForm((f) => ({ ...f, activo: !f.activo }))}
                  >
                    {editForm.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </label>

                <div className="adm-form__footer">
                  <button className="btn btn--primary" type="submit" disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </form>

              <div className="field" style={{ marginTop: 18 }}>
                <span className="field__label">Roles globales</span>
                <div className="adm-row__tags">
                  {roles.map((rol) => {
                    const hasRole = (editingUserFresh.roles || []).includes(rol.nombre);
                    return (
                      <button
                        key={rol.id}
                        type="button"
                        className={`status-chip status-chip--${hasRole ? 'primary' : 'neutral'}`}
                        onClick={() => handleToggleGlobalRole(editingUserFresh, rol.id, hasRole)}
                      >
                        {rol.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field" style={{ marginTop: 18 }}>
                <span className="field__label">Empresas asignadas</span>
                <div className="adm-table">
                  {(editingUserFresh.empresas || []).map((item) => (
                    <div key={item.empresa.id} className="adm-row">
                      <div className="adm-row__main">
                        <strong>{item.empresa.nombre}</strong>
                        <span>{item.rol.nombre}</span>
                      </div>
                      <div className="adm-row__actions">
                        <button className="icon-btn icon-btn--ghost" type="button" onClick={() => handleRemoveEmpresa(item.empresa.id)}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="field-grid field-grid--2" style={{ marginTop: 10 }}>
                  <select value={empresaToAssign} onChange={(e) => setEmpresaToAssign(e.target.value)}>
                    <option value="">Elegir empresa...</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>{company.nombre}</option>
                    ))}
                  </select>
                  <select value={rolToAssign} onChange={(e) => setRolToAssign(e.target.value)}>
                    <option value="">Elegir rol...</option>
                    {roles.map((rol) => (
                      <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                    ))}
                  </select>
                </div>
                <button className="btn btn--secondary btn--block" type="button" onClick={handleAssignEmpresa} style={{ marginTop: 10 }}>
                  <PlusCircle size={16} />
                  Asignar empresa
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {resettingUser ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setResettingUser(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <h3>Resetear contraseña</h3>
                <p>{resettingUser.nombre} {resettingUser.apellido}</p>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setResettingUser(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-panel__body">
              <form className="adm-form" onSubmit={handleResetPassword}>
                <label className="field">
                  <span className="field__label">Nueva contraseña</span>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
                </label>
                <div className="adm-form__footer">
                  <button className="btn btn--primary" type="submit" disabled={resetting}>
                    {resetting ? 'Guardando...' : 'Restablecer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default AdminUsuarios;
