import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarRange,
  CheckCircle2,
  FileText,
  Files,
  Loader2,
  PlusCircle,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { documentoApi, entidadApi, licitacionApi, normalizeApiError } from '../../api/api';
import { capitalizeFirst, combineNit, formatCurrency, formatStatusLabel, toProperCase } from '../../utils/workspace';
import { HITOS } from './Cronograma';

let fechaPersonalizadaSeq = 0;
const nuevaFechaPersonalizada = () => ({ id: `fp-${(fechaPersonalizadaSeq += 1)}`, nombre: '', fecha: '' });

const initialFechas = () => Object.fromEntries(HITOS.map((hito) => [hito.field, '']));

const initialForm = (defaultCompanyId = '') => ({
  empresaId: defaultCompanyId || '',
  numeroSecop: '',
  entidadContratante: '',
  nitBase: '',
  nitDv: '',
  usaArea: false,
  areaEntidad: '',
  objetoContrato: '',
  cuantia: '',
  estado: 'en_busqueda',
  fechas: initialFechas(),
  fechasPersonalizadas: [],
  urlSecop: '',
  notas: '',
});

const OPTIONAL_DOCS = [
  { key: 'camarac', label: 'Cámara de comercio' },
  { key: 'rut', label: 'RUT actualizado' },
  { key: 'balance', label: 'Balance / Estados financieros' },
];

const toIsoDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const CreateLicitacionModal = ({
  open,
  companyOptions = [],
  defaultCompanyId = '',
  isAdmin = false,
  onClose,
  onCreated,
}) => {
  const [form, setForm] = useState(() => initialForm(defaultCompanyId));
  const [pliegoFile, setPliegoFile] = useState(null);
  const [rupFile, setRupFile] = useState(null);
  const [optionalFiles, setOptionalFiles] = useState({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('form');
  const [entidadStatus, setEntidadStatus] = useState('idle');

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(defaultCompanyId));
    setPliegoFile(null);
    setRupFile(null);
    setOptionalFiles({});
    setCreating(false);
    setError('');
    setStep('form');
    setEntidadStatus('idle');
  }, [open, defaultCompanyId]);

  const selectedCompany = useMemo(
    () => companyOptions.find((company) => company.id === form.empresaId) || companyOptions[0] || null,
    [companyOptions, form.empresaId]
  );

  // Autocompleta la entidad contratante buscando por NIT ya conocidos.
  useEffect(() => {
    if (!open || form.nitBase.length < 5 || form.nitDv.length !== 1) {
      setEntidadStatus('idle');
      return undefined;
    }

    const nit = combineNit(form.nitBase, form.nitDv);
    const controller = new AbortController();
    setEntidadStatus('buscando');

    const timer = setTimeout(async () => {
      try {
        const response = await entidadApi.buscarPorNit(nit, { signal: controller.signal });
        if (response.data) {
          setEntidadStatus('encontrada');
          setForm((current) => (current.entidadContratante ? current : { ...current, entidadContratante: response.data.nombre }));
        } else {
          setEntidadStatus('nueva');
        }
      } catch (err) {
        if (!controller.signal.aborted) setEntidadStatus('idle');
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, form.nitBase, form.nitDv]);

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleFechaChange = (field, value) => {
    setForm((current) => ({ ...current, fechas: { ...current.fechas, [field]: value } }));
  };

  const handleAddFechaPersonalizada = () => {
    setForm((current) => ({
      ...current,
      fechasPersonalizadas: [...current.fechasPersonalizadas, nuevaFechaPersonalizada()],
    }));
  };

  const handleFechaPersonalizadaChange = (id, key, value) => {
    setForm((current) => ({
      ...current,
      fechasPersonalizadas: current.fechasPersonalizadas.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      ),
    }));
  };

  const handleRemoveFechaPersonalizada = (id) => {
    setForm((current) => ({
      ...current,
      fechasPersonalizadas: current.fechasPersonalizadas.filter((item) => item.id !== id),
    }));
  };

  const handleOptionalFile = (key, file) => {
    setOptionalFiles((current) => ({ ...current, [key]: file || null }));
  };

  const uploadBaseDocument = async ({ file, nombre, tipoDocumento, tags, licitacionId, processNumber }) => {
    if (!file || !licitacionId || !form.empresaId) return;

    await documentoApi.upload({
      empresaId: form.empresaId,
      licitacionId,
      file,
      nombre,
      tipoDocumento,
      tags,
      metaData: {
        origen: 'licitacion_create',
        proceso: processNumber,
        tipo_documento: tipoDocumento,
      },
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.empresaId || !form.numeroSecop || !form.entidadContratante || !form.nitBase || !form.nitDv || !form.objetoContrato) {
      setError('Completa los campos obligatorios antes de continuar.');
      return;
    }

    setCreating(true);
    setStep('processing');

    try {
      const fechasPayload = Object.fromEntries(
        HITOS.map((hito) => [hito.field, toIsoDateTime(form.fechas[hito.field])])
      );

      const fechasPersonalizadas = form.fechasPersonalizadas
        .filter((item) => item.nombre.trim() && item.fecha)
        .map((item) => ({ nombre: item.nombre.trim(), fecha: toIsoDateTime(item.fecha) }));

      const payload = {
        empresa_id: form.empresaId,
        numero_secop: form.numeroSecop.trim(),
        url_secop: form.urlSecop.trim() || null,
        entidad_contratante: form.entidadContratante.trim(),
        nit_entidad: combineNit(form.nitBase, form.nitDv),
        objeto_contrato: form.objetoContrato.trim(),
        cuantia: form.cuantia ? Number(form.cuantia) : null,
        estado: form.estado,
        ...fechasPayload,
        fechas_personalizadas: fechasPersonalizadas,
        notas: [
          form.notas.trim(),
          form.usaArea && form.areaEntidad.trim() ? `Área de la entidad: ${form.areaEntidad.trim()}` : '',
        ]
          .filter(Boolean)
          .join('\n\n') || null,
      };

      const createResponse = await licitacionApi.create(payload);
      const licitacion = createResponse.data;
      const licitacionId = licitacion.id;

      await uploadBaseDocument({
        file: pliegoFile,
        nombre: `Pliego ${form.numeroSecop}`,
        tipoDocumento: 'pliego',
        tags: 'pliego,base',
        licitacionId,
        processNumber: form.numeroSecop.trim(),
      });

      await uploadBaseDocument({
        file: rupFile,
        nombre: `RUP ${form.numeroSecop}`,
        tipoDocumento: 'rup',
        tags: 'rup,habilitante',
        licitacionId,
        processNumber: form.numeroSecop.trim(),
      });

      for (const doc of OPTIONAL_DOCS) {
        const file = optionalFiles[doc.key];
        if (file) {
          await uploadBaseDocument({
            file,
            nombre: `${doc.label} ${form.numeroSecop}`,
            tipoDocumento: doc.key,
            tags: doc.key,
            licitacionId,
            processNumber: form.numeroSecop.trim(),
          });
        }
      }

      let analysis = null;

      if (pliegoFile) {
        try {
          const analysisResponse = await licitacionApi.analyzePliego(licitacion.id, {
            file: pliegoFile,
          });

          analysis = analysisResponse.data;

          await licitacionApi.update(licitacion.id, {
            pliego_texto: analysis.texto_completo || analysis.texto_preview || null,
            pliego_url: pliegoFile.name,
          });
        } catch (analysisError) {
          console.warn('No fue posible completar el análisis del pliego', analysisError);
          toast('La licitación quedó creada, pero el análisis del pliego se puede reintentar desde IA.');
        }
      }

      toast.success('Licitación creada. Arma el checklist manualmente desde el detalle del proceso.');
      setStep('done');

      await onCreated?.({
        licitacion,
        analysis,
      });
    } catch (err) {
      setError(normalizeApiError(err, 'No fue posible crear la licitación'));
      toast.error(normalizeApiError(err, 'No fue posible crear la licitación'));
      setStep('form');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-panel modal-panel--xl">
        <div className="modal-panel__header">
          <div>
            <div className="section-badge">
              <Files size={14} />
              Nueva licitación
            </div>
            <h3>Crear proceso y dejarlo listo para trabajar.</h3>
            <p>El checklist se arma manualmente después de crear el proceso. Adjuntar pliego/RUP es opcional.</p>
          </div>

          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error ? <div className="alert alert--danger">{error}</div> : null}

        <div className="modal-panel__body modal-panel__body--split">
          <form className="create-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h4>Datos del proceso</h4>

              <label className="field field--required">
                <span className="field__label">Empresa propietaria <span className="field__required">*</span></span>
                <div className="field__control">
                  <Building2 size={18} />
                  <select value={form.empresaId} onChange={(event) => handleChange('empresaId', event.target.value)}>
                    {companyOptions.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <div className="field-grid field-grid--2">
                <label className="field field--required">
                  <span className="field__label">Número de proceso <span className="field__required">*</span></span>
                  <div className="field__control">
                    <FileText size={18} />
                    <input
                      value={form.numeroSecop}
                      onChange={(event) => handleChange('numeroSecop', event.target.value)}
                      placeholder="2026-00001"
                    />
                  </div>
                </label>

                <label className="field">
                  <span className="field__label">Estado</span>
                  <div className="field__control">
                    <ShieldCheck size={18} />
                    <select value={form.estado} onChange={(event) => handleChange('estado', event.target.value)}>
                      {['en_busqueda', 'en_preparacion', 'presentada', 'adjudicada', 'perdida', 'desierta', 'cancelada'].map((status) => (
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
                  <span className="field__label">NIT base <span className="field__required">*</span> (busca primero, así no reescribes la entidad)</span>
                  <div className="field__control">
                    <Search size={18} />
                    <input
                      autoFocus
                      value={form.nitBase}
                      onChange={(event) => handleChange('nitBase', event.target.value.replace(/\D/g, ''))}
                      placeholder="900123456"
                    />
                  </div>
                </label>

                <label className="field field--required">
                  <span className="field__label">DV <span className="field__required">*</span></span>
                  <div className="field__control">
                    <input
                      value={form.nitDv}
                      onChange={(event) => handleChange('nitDv', event.target.value.replace(/\D/g, '').slice(0, 1))}
                      placeholder="7"
                    />
                  </div>
                </label>
              </div>

              <label className="field field--required">
                <span className="field__label">
                  Entidad contratante <span className="field__required">*</span>
                  {entidadStatus === 'buscando' ? <span className="entidad-status">Buscando por NIT...</span> : null}
                  {entidadStatus === 'encontrada' ? <span className="entidad-status entidad-status--found">Entidad encontrada, datos autocompletados</span> : null}
                  {entidadStatus === 'nueva' ? <span className="entidad-status entidad-status--new">Entidad nueva, se guardará para la próxima búsqueda</span> : null}
                </span>
                <div className="field__control">
                  <Building2 size={18} />
                  <input
                    value={form.entidadContratante}
                    onChange={(event) => handleChange('entidadContratante', capitalizeFirst(event.target.value))}
                    placeholder="Escribe el NIT arriba para autocompletar, o digítala aquí"
                  />
                </div>
              </label>

              <label className="field">
                <span className="field__label">Cuantía</span>
                <div className="field__control">
                  <span>$</span>
                  <input
                    value={form.cuantia ? new Intl.NumberFormat('es-CO').format(Number(form.cuantia)) : ''}
                    onChange={(event) => handleChange('cuantia', event.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    inputMode="numeric"
                  />
                </div>
              </label>

              <label className="field field--toggle">
                <span className="field__label">Área de la entidad</span>
                <div className="switch-row">
                  <button
                    type="button"
                    className={`switch ${form.usaArea ? 'switch--active' : ''}`}
                    onClick={() => handleChange('usaArea', !form.usaArea)}
                  >
                    {form.usaArea ? 'Activa' : 'Opcional'}
                  </button>
                  <input
                    disabled={!form.usaArea}
                    value={form.areaEntidad}
                    onChange={(event) => handleChange('areaEntidad', capitalizeFirst(event.target.value))}
                    placeholder="Dependencia / área"
                  />
                </div>
              </label>

              <label className="field field--required">
                <span className="field__label">Objeto del contrato <span className="field__required">*</span></span>
                <textarea
                  rows={4}
                  value={form.objetoContrato}
                  onChange={(event) => handleChange('objetoContrato', capitalizeFirst(event.target.value))}
                  placeholder="Describe el objeto contractual"
                />
              </label>

              <label className="field">
                <span className="field__label">URL SECOP</span>
                <input
                  value={form.urlSecop}
                  onChange={(event) => handleChange('urlSecop', event.target.value)}
                  placeholder="https://..."
                />
              </label>

              <h4>Cronograma (puedes ajustarlo después desde el detalle del proceso)</h4>
              <div className="field-grid field-grid--2">
                {HITOS.map((hito) => (
                  <label className="field" key={hito.field}>
                    <span className="field__label">{hito.label}</span>
                    <input
                      type="date"
                      value={form.fechas[hito.field]}
                      onChange={(event) => handleFechaChange(hito.field, event.target.value)}
                    />
                  </label>
                ))}
              </div>

              {form.fechasPersonalizadas.length > 0 ? (
                <div className="field-grid field-grid--2">
                  {form.fechasPersonalizadas.map((item) => (
                    <React.Fragment key={item.id}>
                      <label className="field">
                        <span className="field__label">Nombre de la fecha</span>
                        <input
                          value={item.nombre}
                          onChange={(event) =>
                            handleFechaPersonalizadaChange(item.id, 'nombre', capitalizeFirst(event.target.value))
                          }
                          placeholder="Ej. Audiencia de aclaraciones"
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Fecha</span>
                        <div className="field__control">
                          <input
                            type="date"
                            value={item.fecha}
                            onChange={(event) => handleFechaPersonalizadaChange(item.id, 'fecha', event.target.value)}
                          />
                          <button
                            className="icon-btn icon-btn--ghost icon-btn--danger"
                            type="button"
                            onClick={() => handleRemoveFechaPersonalizada(item.id)}
                            title="Quitar esta fecha"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </label>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}

              <button className="btn btn--secondary" type="button" onClick={handleAddFechaPersonalizada}>
                <PlusCircle size={16} />
                Agregar fecha
              </button>

              <label className="field">
                <span className="field__label">Notas</span>
                <textarea
                  rows={3}
                  value={form.notas}
                  onChange={(event) => handleChange('notas', capitalizeFirst(event.target.value))}
                  placeholder="Observaciones internas"
                />
              </label>
            </div>
          </form>

          <aside className="create-side">
            <div className="info-block">
              <div className="info-block__header">
                <h4>Documentos (opcionales)</h4>
              </div>

              <div className="mini-checklist">
                <div className="mini-checklist__item">
                  <div className={`status-dot status-dot--${pliegoFile ? 'success' : 'neutral'}`} />
                  <div className="mini-checklist__copy">
                    <strong>Pliego (de la entidad contratante)</strong>
                    <span>{pliegoFile ? pliegoFile.name : 'Opcional'}</span>
                  </div>
                </div>
                <div className="mini-checklist__item">
                  <div className={`status-dot status-dot--${rupFile ? 'success' : 'neutral'}`} />
                  <div className="mini-checklist__copy">
                    <strong>RUP (de tu empresa)</strong>
                    <span>{rupFile ? rupFile.name : 'Opcional'}</span>
                  </div>
                </div>
                {isAdmin
                  ? OPTIONAL_DOCS.map((doc) => (
                      <div key={doc.key} className="mini-checklist__item">
                        <div className={`status-dot status-dot--${optionalFiles[doc.key] ? 'success' : 'neutral'}`} />
                        <div className="mini-checklist__copy">
                          <strong>{doc.label}</strong>
                          <span>{optionalFiles[doc.key] ? optionalFiles[doc.key].name : 'Opcional'}</span>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            </div>

            <div className="upload-card">
              <div className="upload-card__item">
                <span>Pliego (opcional) — documento de la entidad contratante</span>
                <label className="upload-zone">
                  <Upload size={18} />
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setPliegoFile(event.target.files?.[0] || null)} />
                  <strong>{pliegoFile ? pliegoFile.name : 'Seleccionar archivo'}</strong>
                </label>
              </div>

              <div className="upload-card__item">
                <span>RUP (opcional) — de tu empresa (la que se va a postular)</span>
                <label className="upload-zone">
                  <Upload size={18} />
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setRupFile(event.target.files?.[0] || null)} />
                  <strong>{rupFile ? rupFile.name : 'Seleccionar archivo'}</strong>
                </label>
              </div>

              {isAdmin
                ? OPTIONAL_DOCS.map((doc) => (
                    <div key={doc.key} className="upload-card__item">
                      <span>{doc.label}</span>
                      <label className="upload-zone">
                        <Upload size={18} />
                        <input
                          type="file"
                          onChange={(event) => handleOptionalFile(doc.key, event.target.files?.[0] || null)}
                        />
                        <strong>{optionalFiles[doc.key]?.name || 'Opcional'}</strong>
                      </label>
                    </div>
                  ))
                : null}
            </div>

            <div className="preview-card">
              <div className="preview-card__row">
                <span>Entidad</span>
                <strong>{toProperCase(form.entidadContratante) || 'Sin entidad'}</strong>
              </div>
              <div className="preview-card__row">
                <span>NIT entidad</span>
                <strong>{combineNit(form.nitBase, form.nitDv) || '—'}</strong>
              </div>
              <div className="preview-card__row">
                <span>Cuantía</span>
                <strong>{formatCurrency(form.cuantia || 0)}</strong>
              </div>
              <div className="preview-card__row">
                <span>Estado</span>
                <strong>{formatStatusLabel(form.estado)}</strong>
              </div>
            </div>

            {step === 'done' ? (
              <div className="success-panel">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Licitación creada</strong>
                  <span>Arma el checklist manualmente desde el detalle del proceso.</span>
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        <div className="modal-panel__footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="button" onClick={handleSubmit} disabled={creating}>
            {creating ? (
              <>
                <Loader2 size={16} className="spin" />
                Guardando...
              </>
            ) : (
              'Crear licitación'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateLicitacionModal;
