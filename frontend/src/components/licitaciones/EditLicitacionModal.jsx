import React, { useEffect, useState } from 'react';
import { Building2, FileText, Loader2, Pencil, Search, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { licitacionApi, normalizeApiError } from '../../api/api';
import { capitalizeFirst, combineNit, formatStatusLabel, splitNit } from '../../utils/workspace';

const ESTADOS = ['en_busqueda', 'en_preparacion', 'presentada', 'adjudicada', 'perdida', 'desierta', 'cancelada'];

const buildForm = (licitacion) => {
  const { base, dv } = splitNit(licitacion?.nit_entidad);
  return {
    numeroSecop: licitacion?.numero_secop || '',
    urlSecop: licitacion?.url_secop || '',
    entidadContratante: licitacion?.entidad_contratante || '',
    nitBase: base,
    nitDv: dv,
    objetoContrato: licitacion?.objeto_contrato || '',
    cuantia: licitacion?.cuantia ? String(licitacion.cuantia) : '',
    estado: licitacion?.estado || 'en_busqueda',
    notas: licitacion?.notas || '',
  };
};

// Modal ligero para corregir los datos base de una licitación ya creada (numero de
// proceso, entidad, objeto, cuantía, etc.), sin tocar documentos ni cronograma —
// eso ya se edita desde Cronograma y desde Biblioteca respectivamente.
const EditLicitacionModal = ({ open, licitacion, onClose, onSaved }) => {
  const [form, setForm] = useState(() => buildForm(licitacion));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(buildForm(licitacion));
    setError('');
  }, [open, licitacion]);

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!licitacion?.id) return;

    if (!form.numeroSecop || !form.entidadContratante || !form.nitBase || !form.nitDv || !form.objetoContrato) {
      setError('Completa los campos obligatorios antes de guardar.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        numero_secop: form.numeroSecop.trim(),
        url_secop: form.urlSecop.trim() || null,
        entidad_contratante: form.entidadContratante.trim(),
        nit_entidad: combineNit(form.nitBase, form.nitDv),
        objeto_contrato: form.objetoContrato.trim(),
        cuantia: form.cuantia ? Number(form.cuantia) : null,
        estado: form.estado,
        notas: form.notas.trim() || null,
      };

      const response = await licitacionApi.update(licitacion.id, payload);
      toast.success('Licitación actualizada');
      onSaved?.(response.data);
    } catch (err) {
      const message = normalizeApiError(err, 'No fue posible actualizar la licitación');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <div className="section-badge">
              <Pencil size={14} />
              Modificar licitación
            </div>
            <h3>Corrige los datos del proceso</h3>
            <p>El cronograma y los documentos se editan aparte, desde el detalle del proceso.</p>
          </div>

          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error ? <div className="alert alert--danger">{error}</div> : null}

        <form className="create-form modal-panel__body" onSubmit={handleSubmit}>
          <div className="form-section">
            <div className="field-grid field-grid--2">
              <label className="field field--required">
                <span className="field__label">Número de proceso <span className="field__required">*</span></span>
                <div className="field__control">
                  <FileText size={18} />
                  <input value={form.numeroSecop} onChange={(event) => handleChange('numeroSecop', event.target.value)} />
                </div>
              </label>

              <label className="field">
                <span className="field__label">Estado</span>
                <div className="field__control">
                  <ShieldCheck size={18} />
                  <select value={form.estado} onChange={(event) => handleChange('estado', event.target.value)}>
                    {ESTADOS.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            <div className="field-grid field-grid--2">
              <label className="field field--required">
                <span className="field__label">NIT base <span className="field__required">*</span></span>
                <div className="field__control">
                  <Search size={18} />
                  <input
                    value={form.nitBase}
                    onChange={(event) => handleChange('nitBase', event.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </label>

              <label className="field field--required">
                <span className="field__label">DV <span className="field__required">*</span></span>
                <div className="field__control">
                  <input
                    value={form.nitDv}
                    onChange={(event) => handleChange('nitDv', event.target.value.replace(/\D/g, '').slice(0, 1))}
                  />
                </div>
              </label>
            </div>

            <label className="field field--required">
              <span className="field__label">Entidad contratante <span className="field__required">*</span></span>
              <div className="field__control">
                <Building2 size={18} />
                <input
                  value={form.entidadContratante}
                  onChange={(event) => handleChange('entidadContratante', capitalizeFirst(event.target.value))}
                />
              </div>
            </label>

            <label className="field field--required">
              <span className="field__label">Objeto del contrato <span className="field__required">*</span></span>
              <textarea
                rows={3}
                value={form.objetoContrato}
                onChange={(event) => handleChange('objetoContrato', capitalizeFirst(event.target.value))}
              />
            </label>

            <div className="field-grid field-grid--2">
              <label className="field">
                <span className="field__label">Cuantía</span>
                <div className="field__control">
                  <span>$</span>
                  <input
                    value={form.cuantia ? new Intl.NumberFormat('es-CO').format(Number(form.cuantia)) : ''}
                    onChange={(event) => handleChange('cuantia', event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                  />
                </div>
              </label>

              <label className="field">
                <span className="field__label">URL SECOP</span>
                <input value={form.urlSecop} onChange={(event) => handleChange('urlSecop', event.target.value)} />
              </label>
            </div>

            <label className="field">
              <span className="field__label">Notas</span>
              <textarea rows={3} value={form.notas} onChange={(event) => handleChange('notas', capitalizeFirst(event.target.value))} />
            </label>
          </div>
        </form>

        <div className="modal-panel__footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={16} className="spin" />
                Guardando...
              </>
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditLicitacionModal;
