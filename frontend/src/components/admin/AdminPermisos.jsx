import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { normalizeApiError, userApi } from '../../api/api';

const AdminPermisos = () => {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permisos, setPermisos] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPermisos, setLoadingPermisos] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true);
      try {
        const response = await userApi.list({ limit: 200 });
        const list = Array.isArray(response.data) ? response.data : [];
        setUsers(list);
        if (list.length) setSelectedUserId(list[0].id);
      } catch (err) {
        setError(normalizeApiError(err, 'No fue posible cargar los usuarios'));
      } finally {
        setLoadingUsers(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;

    const load = async () => {
      setLoadingPermisos(true);
      setError('');
      try {
        const response = await userApi.getPermisos(selectedUserId);
        setPermisos(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        setError(normalizeApiError(err, 'No fue posible cargar los permisos'));
      } finally {
        setLoadingPermisos(false);
      }
    };
    load();
  }, [selectedUserId]);

  const groupedByModulo = useMemo(() => {
    const groups = new Map();
    permisos.forEach((permiso) => {
      const list = groups.get(permiso.modulo) || [];
      list.push(permiso);
      groups.set(permiso.modulo, list);
    });
    return Array.from(groups.entries());
  }, [permisos]);

  const handleToggle = async (permiso) => {
    const nuevoValor = !permiso.otorgado;
    setPermisos((current) => current.map((item) => (item.key === permiso.key ? { ...item, otorgado: nuevoValor } : item)));

    setSaving(true);
    try {
      const response = await userApi.setPermisos(selectedUserId, [{ key: permiso.key, otorgado: nuevoValor }]);
      setPermisos(Array.isArray(response.data) ? response.data : []);
      toast.success('Permiso actualizado');
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar el permiso'));
      setPermisos((current) => current.map((item) => (item.key === permiso.key ? { ...item, otorgado: !nuevoValor } : item)));
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = users.find((user) => user.id === selectedUserId);

  return (
    <section className="adm-section">
      <div className="adm-section__header">
        <div>
          <h2>Permisos por usuario</h2>
          <p>Los permisos puntuales pisan lo que otorga el rol del usuario, sin importar cuál sea.</p>
        </div>
      </div>

      {error ? <div className="adm-alert">{error}</div> : null}

      {loadingUsers ? (
        <div className="adm-loading">
          <Loader2 size={20} className="spin" />
          <span>Cargando usuarios...</span>
        </div>
      ) : (
        <label className="field">
          <span className="field__label">Usuario</span>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nombre} {user.apellido} · {user.email}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedUser ? (
        <p className="text-muted">
          Roles actuales: {(selectedUser.roles || []).join(', ') || 'sin rol'}
        </p>
      ) : null}

      {loadingPermisos ? (
        <div className="adm-loading">
          <Loader2 size={20} className="spin" />
          <span>Cargando permisos...</span>
        </div>
      ) : (
        groupedByModulo.map(([modulo, items]) => (
          <div key={modulo} className="adm-permiso-group">
            <h3>{modulo}</h3>
            {items.map((permiso) => (
              <div key={permiso.key} className="adm-permiso-item">
                <span>
                  <KeyRound size={13} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  {permiso.label}
                  {permiso.sobreescrito ? ' (personalizado)' : ''}
                </span>
                <button
                  type="button"
                  className={`switch ${permiso.otorgado ? 'switch--active' : ''}`}
                  onClick={() => handleToggle(permiso)}
                  disabled={saving}
                >
                  {permiso.otorgado ? 'Otorgado' : 'Denegado'}
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
};

export default AdminPermisos;
