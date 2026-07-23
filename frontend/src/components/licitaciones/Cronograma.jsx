import React, { useMemo, useState } from 'react';
import { CalendarClock, Loader2, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { licitacionApi, normalizeApiError } from '../../api/api';
import { formatDateShort } from '../../utils/workspace';

export const HITOS = [
  { field: 'fecha_publicacion', label: 'Publicación' },
  { field: 'fecha_visita_obra', label: 'Visita sitio' },
  { field: 'fecha_consultas', label: 'Consultas' },
  { field: 'fecha_cierre_dudas', label: 'Cierre de dudas' },
  { field: 'fecha_cierre', label: 'Presentación propuestas' },
  { field: 'fecha_subsanacion', label: 'Subsanación' },
  { field: 'fecha_evaluacion', label: 'Evaluación' },
  { field: 'fecha_adjudicacion', label: 'Adjudicación' },
];

const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const toIsoDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const computeEstados = (licitacion) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let yaHayEnCurso = false;

  return HITOS.map((hito) => {
    const raw = licitacion?.[hito.field];
    if (!raw) {
      return { ...hito, estado: 'futuro', fecha: null };
    }

    const fecha = new Date(raw);
    fecha.setHours(0, 0, 0, 0);

    if (fecha < hoy) {
      return { ...hito, estado: 'completado', fecha: raw };
    }

    if (!yaHayEnCurso) {
      yaHayEnCurso = true;
      return { ...hito, estado: 'en_curso', fecha: raw };
    }

    return { ...hito, estado: 'futuro', fecha: raw };
  });
};

const ESTADO_LABEL = {
  completado: 'Completado',
  en_curso: 'En curso',
  futuro: 'Futuro',
};

const Cronograma = ({ licitacion, isAdmin, onUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => {
    const initial = {};
    HITOS.forEach((hito) => {
      initial[hito.field] = toDateInputValue(licitacion?.[hito.field]);
    });
    return initial;
  });

  const pasos = useMemo(() => computeEstados(licitacion), [licitacion]);

  const openEdit = () => {
    const initial = {};
    HITOS.forEach((hito) => {
      initial[hito.field] = toDateInputValue(licitacion?.[hito.field]);
    });
    setForm(initial);
    setEditing(true);
  };

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!licitacion?.id) return;
    setSaving(true);

    try {
      const payload = {};
      HITOS.forEach((hito) => {
        payload[hito.field] = toIsoDateTime(form[hito.field]);
      });

      await licitacionApi.update(licitacion.id, payload);
      toast.success('Cronograma actualizado');
      setEditing(false);
      await onUpdated?.();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar el cronograma'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lic-detail__section">
      <div className="lic-detail__section-header">
        <h3>
          <CalendarClock size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Cronograma
        </h3>
        {isAdmin ? (
          editing ? (
            <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setEditing(false)} title="Cancelar edición">
              <X size={16} />
            </button>
          ) : (
            <button className="icon-btn icon-btn--ghost" type="button" onClick={openEdit} title="Editar fechas">
              <Pencil size={16} />
            </button>
          )
        ) : null}
      </div>

      {editing ? (
        <>
          <div className="cronograma__edit-grid">
            {HITOS.map((hito) => (
              <label className="field" key={hito.field}>
                <span className="field__label">{hito.label}</span>
                <input
                  type="date"
                  value={form[hito.field]}
                  onChange={(event) => handleChange(hito.field, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="lic-actions">
            <button className="btn btn--ghost" type="button" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn--primary" type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : null}
              {saving ? 'Guardando...' : 'Guardar cronograma'}
            </button>
          </div>
        </>
      ) : (
        <div className="cronograma__list">
          {pasos.map((paso) => (
            <div key={paso.field} className={`cronograma__step cronograma__step--${paso.estado}`}>
              <span className="cronograma__dot" />
              <span className="cronograma__label">{paso.label}</span>
              <span className="cronograma__date">{paso.fecha ? formatDateShort(paso.fecha) : 'Sin fecha'}</span>
              <span className="cronograma__status">{ESTADO_LABEL[paso.estado]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Cronograma;
