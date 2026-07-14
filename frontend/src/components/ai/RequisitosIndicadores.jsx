import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck, Hash, ListChecks, PlusCircle, ShieldCheck, Tag, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { requisitoApi, normalizeApiError } from '../../api/api';

const ESTADO_TONE = {
  cumple: 'success',
  no_cumple: 'danger',
  pendiente: 'neutral',
  vinculado: 'warning',
  cargado: 'warning',
  por_revisar: 'warning',
};

const ESTADO_LABEL = {
  cumple: 'Cumple',
  no_cumple: 'No cumple',
  pendiente: 'Pendiente',
  vinculado: 'Vinculado',
  cargado: 'Cargado',
  por_revisar: 'Por revisar',
};

const emptyForm = {
  nombre: '',
  tipo: 'especifico',
  codigo: '',
  valorSolicitado: '',
  obligatorio: true,
};

const RequisitosIndicadores = ({ licitacionId, documentos = [] }) => {
  const [requisitos, setRequisitos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [documentoId, setDocumentoId] = useState('');
  const [evaluando, setEvaluando] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (!licitacionId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await requisitoApi.list(licitacionId, { signal: controller.signal });
        setRequisitos(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(normalizeApiError(err, 'No fue posible cargar los indicadores'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [licitacionId]);

  useEffect(() => {
    if (documentoId || !documentos.length) return;
    const rup = documentos.find((doc) => (doc.tags || '').toLowerCase().includes('rup'));
    setDocumentoId((rup || documentos[0])?.id || '');
  }, [documentos, documentoId]);

  const resumen = useMemo(() => {
    const total = requisitos.length;
    const cumplen = requisitos.filter((r) => r.estado === 'cumple').length;
    return { total, cumplen };
  }, [requisitos]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!licitacionId || !form.nombre.trim()) {
      toast.error('Ingresa un nombre para el indicador');
      return;
    }

    if (form.tipo === 'especifico' && !form.codigo.trim()) {
      toast.error('Ingresa el código UNSPSC a exigir');
      return;
    }

    setCreating(true);

    try {
      const payload =
        form.tipo === 'especifico'
          ? {
              nombre: form.nombre.trim(),
              tipo: 'especifico',
              requisito_especifico: { codigo: form.codigo.trim() },
              valor_solicitado: form.codigo.trim(),
              obligatorio: form.obligatorio,
            }
          : {
              nombre: form.nombre.trim(),
              tipo: 'global',
              valor_solicitado: form.valorSolicitado.trim() || null,
              obligatorio: form.obligatorio,
            };

      const response = await requisitoApi.create(licitacionId, payload);
      setRequisitos((current) => [...current, response.data]);
      setForm(emptyForm);
      toast.success('Indicador agregado');
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible agregar el indicador'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (requisitoId) => {
    try {
      await requisitoApi.remove(licitacionId, requisitoId);
      setRequisitos((current) => current.filter((item) => item.id !== requisitoId));
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar el indicador'));
    }
  };

  const handleEvaluar = async () => {
    if (!documentoId) {
      toast.error('Selecciona el RUP a evaluar');
      return;
    }

    setEvaluando(true);

    try {
      const response = await requisitoApi.evaluar(licitacionId, documentoId);
      setRequisitos(response.data.requisitos || []);
      toast.success('Indicadores evaluados contra el RUP');
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible evaluar los indicadores'));
    } finally {
      setEvaluando(false);
    }
  };

  if (!licitacionId) return null;

  return (
    <section className="surface-panel">
      <div className="surface-panel__header">
        <div>
          <div className="section-badge">
            <ListChecks size={14} />
            Indicadores
          </div>
          <h3>Lo que pide el pliego, cotejado contra el RUP.</h3>
          <p>Agrega los códigos UNSPSC u otros requisitos y evalúa si la empresa cumple.</p>
        </div>
      </div>

      {error ? <div className="alert alert--danger">{error}</div> : null}

      <div className="split-grid split-grid--wide">
        <form className="analyzer-form" onSubmit={handleCreate}>
          <label className="field">
            <span className="field__label">Nombre del indicador</span>
            <div className="field__control">
              <Tag size={18} />
              <input
                value={form.nombre}
                onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
                placeholder="Ej. Experiencia en mantenimiento de equipos"
              />
            </div>
          </label>

          <div className="field-grid field-grid--2">
            <label className="field">
              <span className="field__label">Tipo</span>
              <div className="field__control">
                <ListChecks size={18} />
                <select
                  value={form.tipo}
                  onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value }))}
                >
                  <option value="especifico">Código UNSPSC</option>
                  <option value="global">Requisito general</option>
                </select>
              </div>
            </label>

            {form.tipo === 'especifico' ? (
              <label className="field">
                <span className="field__label">Código UNSPSC</span>
                <div className="field__control">
                  <Hash size={18} />
                  <input
                    value={form.codigo}
                    onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.replace(/\D/g, '') }))}
                    placeholder="43211500"
                  />
                </div>
              </label>
            ) : (
              <label className="field">
                <span className="field__label">Valor solicitado</span>
                <div className="field__control">
                  <Hash size={18} />
                  <input
                    value={form.valorSolicitado}
                    onChange={(event) => setForm((current) => ({ ...current, valorSolicitado: event.target.value }))}
                    placeholder="Ej. Puntaje mínimo 80"
                  />
                </div>
              </label>
            )}
          </div>

          <label className="field field--toggle">
            <span className="field__label">Obligatorio</span>
            <button
              type="button"
              className={`switch ${form.obligatorio ? 'switch--active' : ''}`}
              onClick={() => setForm((current) => ({ ...current, obligatorio: !current.obligatorio }))}
            >
              {form.obligatorio ? 'Sí' : 'No'}
            </button>
          </label>

          <button className="btn btn--secondary btn--block" type="submit" disabled={creating}>
            <PlusCircle size={16} />
            {creating ? 'Agregando...' : 'Agregar indicador'}
          </button>
        </form>

        <div className="create-side">
          <label className="field">
            <span className="field__label">Documento RUP a evaluar</span>
            <div className="field__control">
              <FileCheck size={18} />
              <select value={documentoId} onChange={(event) => setDocumentoId(event.target.value)}>
                {documentos.length === 0 ? <option value="">Sin documentos cargados</option> : null}
                {documentos.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.nombre}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <button
            className="btn btn--primary btn--block"
            type="button"
            onClick={handleEvaluar}
            disabled={!documentoId || evaluando}
          >
            <ShieldCheck size={16} />
            {evaluando ? 'Evaluando...' : 'Evaluar contra RUP'}
          </button>
          {!documentos.length ? <p className="text-muted">Sube el RUP en Checklist antes de evaluar.</p> : null}
        </div>
      </div>

      <div className="info-block">
        <div className="info-block__header">
          <h4>Indicadores del proceso</h4>
          <span>{resumen.cumplen}/{resumen.total} cumplen</span>
        </div>

        {loading ? (
          <p className="text-muted">Cargando indicadores...</p>
        ) : requisitos.length === 0 ? (
          <div className="empty-inline">Todavía no hay indicadores para esta licitación.</div>
        ) : (
          <div className="mini-checklist">
            {requisitos.map((item) => (
              <div key={item.id} className="mini-checklist__item">
                <div className={`status-dot status-dot--${ESTADO_TONE[item.estado] || 'neutral'}`} />
                <div className="mini-checklist__copy">
                  <strong>{item.nombre}</strong>
                  <span>{item.valor_calculado || item.valor_solicitado || 'Sin valor calculado'}</span>
                </div>
                <span className={`status-chip status-chip--${ESTADO_TONE[item.estado] || 'neutral'}`}>
                  {ESTADO_LABEL[item.estado] || item.estado}
                </span>
                <button className="icon-btn icon-btn--ghost" type="button" onClick={() => handleDelete(item.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default RequisitosIndicadores;
