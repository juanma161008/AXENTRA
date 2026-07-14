import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Pencil, PlusCircle, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { empresaApi, normalizeApiError } from '../../api/api';
import { combineNit, splitNit, getInitials } from '../../utils/workspace';

const emptyForm = {
  nombre: '',
  nitBase: '',
  nitDv: '',
  direccion: '',
  telefono: '',
  email: '',
  sitioWeb: '',
  logoUrl: '',
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const AdminEmpresas = () => {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await empresaApi.list({ limit: 200 });
      setEmpresas(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(normalizeApiError(err, 'No fue posible cargar las empresas'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (empresa) => {
    const { base, dv } = splitNit(empresa.nit);
    setEditingId(empresa.id);
    setForm({
      nombre: empresa.nombre,
      nitBase: base,
      nitDv: dv,
      direccion: empresa.direccion || '',
      telefono: empresa.telefono || '',
      email: empresa.email || '',
      sitioWeb: empresa.sitio_web || '',
      logoUrl: empresa.logo_url || '',
    });
    setModalOpen(true);
  };

  const handleLogoFile = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((f) => ({ ...f, logoUrl: dataUrl }));
    } catch {
      toast.error('No fue posible leer la imagen');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.nombre.trim() || !form.nitBase.trim() || !form.nitDv.trim()) {
      toast.error('Nombre y NIT son obligatorios');
      return;
    }

    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      nit: combineNit(form.nitBase, form.nitDv),
      direccion: form.direccion.trim() || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      sitio_web: form.sitioWeb.trim() || null,
      logo_url: form.logoUrl || null,
    };

    try {
      if (editingId) {
        await empresaApi.update(editingId, payload);
        toast.success('Empresa actualizada');
      } else {
        await empresaApi.create(payload);
        toast.success('Empresa creada');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible guardar la empresa'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (empresa) => {
    if (!window.confirm(`¿Desactivar ${empresa.nombre}?`)) return;
    try {
      await empresaApi.remove(empresa.id);
      toast.success('Empresa desactivada');
      await load();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible desactivar la empresa'));
    }
  };

  return (
    <section className="adm-section">
      <div className="adm-section__header">
        <div>
          <h2>Empresas</h2>
          <p>Las empresas que aparecen en el selector del workspace, con su logo.</p>
        </div>
        <button className="btn btn--primary" type="button" onClick={openCreate}>
          <PlusCircle size={16} />
          Nueva empresa
        </button>
      </div>

      {error ? <div className="adm-alert">{error}</div> : null}

      {loading ? (
        <div className="adm-loading">
          <Loader2 size={20} className="spin" />
          <span>Cargando empresas...</span>
        </div>
      ) : empresas.length === 0 ? (
        <div className="adm-empty">
          <Building2 size={26} />
          <h3>Sin empresas todavía</h3>
        </div>
      ) : (
        <div className="adm-table">
          {empresas.map((empresa) => (
            <div key={empresa.id} className="adm-row">
              <div className="adm-row__avatar">
                {empresa.logo_url ? <img src={empresa.logo_url} alt={empresa.nombre} /> : <span>{getInitials(empresa.nombre)}</span>}
              </div>
              <div className="adm-row__main">
                <strong>{empresa.nombre}</strong>
                <span>NIT {empresa.nit}</span>
              </div>
              <div className="adm-row__tags">
                <span className={`status-chip status-chip--${empresa.activo ? 'success' : 'neutral'}`}>
                  {empresa.activo ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <div className="adm-row__actions">
                <button className="icon-btn icon-btn--ghost" type="button" onClick={() => openEdit(empresa)} title="Editar">
                  <Pencil size={15} />
                </button>
                <button className="icon-btn icon-btn--ghost" type="button" onClick={() => handleDelete(empresa)} title="Desactivar">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setModalOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <h3>{editingId ? 'Editar empresa' : 'Nueva empresa'}</h3>
                <p>Estos datos son los que ve el usuario en el selector de empresa.</p>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              <form className="adm-form" onSubmit={handleSubmit}>
                <div className="field field--toggle">
                  <span className="field__label">Logo</span>
                  <div className="switch-row">
                    <div className="adm-row__avatar" style={{ width: 48, height: 48 }}>
                      {form.logoUrl ? <img src={form.logoUrl} alt="logo" /> : <span>{getInitials(form.nombre || 'AX')}</span>}
                    </div>
                    <label className="upload-zone">
                      <Upload size={16} />
                      <input type="file" accept="image/*" onChange={(e) => handleLogoFile(e.target.files?.[0])} />
                      <strong>Subir logo</strong>
                    </label>
                  </div>
                </div>

                <label className="field">
                  <span className="field__label">Nombre *</span>
                  <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
                </label>

                <div className="field-grid field-grid--2">
                  <label className="field">
                    <span className="field__label">NIT base *</span>
                    <input value={form.nitBase} onChange={(e) => setForm((f) => ({ ...f, nitBase: e.target.value.replace(/\D/g, '') }))} />
                  </label>
                  <label className="field">
                    <span className="field__label">DV *</span>
                    <input value={form.nitDv} onChange={(e) => setForm((f) => ({ ...f, nitDv: e.target.value.replace(/\D/g, '').slice(0, 1) }))} />
                  </label>
                </div>

                <label className="field">
                  <span className="field__label">Dirección</span>
                  <input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
                </label>

                <div className="field-grid field-grid--2">
                  <label className="field">
                    <span className="field__label">Teléfono</span>
                    <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field__label">Email</span>
                    <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  </label>
                </div>

                <label className="field">
                  <span className="field__label">Sitio web</span>
                  <input value={form.sitioWeb} onChange={(e) => setForm((f) => ({ ...f, sitioWeb: e.target.value }))} />
                </label>

                <div className="adm-form__footer">
                  <button className="btn btn--primary" type="submit" disabled={saving}>
                    {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear empresa'}
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

export default AdminEmpresas;
