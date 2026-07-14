import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  CircleDotDashed,
  FileStack,
  FileDown,
  FileX,
  Lightbulb,
  ListX,
  Loader2,
  PlusCircle,
  Upload,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { documentoApi, licitacionApi, normalizeApiError, requisitoApi } from '../../api/api';
import { toProperCase } from '../../utils/workspace';
import LicitacionSelector from '../shared/LicitacionSelector';

const CATEGORIA_LABELS = {
  habilitante: 'Habilitante',
  juridico: 'Jurídico',
  tributario: 'Tributario',
  financiero: 'Financiero',
  tecnico: 'Técnico',
  personalizado: 'Personalizado',
};

const formatCategoria = (categoria) => CATEGORIA_LABELS[categoria] || toProperCase(categoria) || 'Sin categoría';

const Checklist = ({
  selectedCompany,
  isAdmin,
  selectedLicitacionId,
  onSelectLicitacion,
  refreshToken,
  onRefreshWorkspace,
  onNavigate,
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingKey, setUploadingKey] = useState('');
  const [newRequisitoNombre, setNewRequisitoNombre] = useState('');
  const [newRequisitoObligatorio, setNewRequisitoObligatorio] = useState(true);
  const [savingRequisito, setSavingRequisito] = useState(false);
  const [addingSuggestion, setAddingSuggestion] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedLicitacionId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await licitacionApi.explorer(selectedLicitacionId);
        if (!cancelled) setData(response.data);
      } catch (err) {
        if (!cancelled) {
          setError(normalizeApiError(err, 'No fue posible cargar el checklist'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedLicitacionId, refreshToken]);

  const items = data?.documentos_obligatorios || [];
  const stats = data?.resumen_documental || {};

  const suggestions = useMemo(() => {
    const raw = data?.pliego_analisis?.requisitos_sugeridos || [];
    const existentes = new Set(
      items.filter((item) => item.personalizado).map((item) => item.nombre.trim().toLowerCase())
    );
    return raw.filter((texto) => !existentes.has(texto.slice(0, 200).trim().toLowerCase()));
  }, [data, items]);

  const progress = useMemo(() => {
    if (!items.length) return 0;
    const done = items.filter((item) => item.cumple).length;
    return Math.round((done / items.length) * 100);
  }, [items]);

  const refreshExplorer = async () => {
    const refreshed = await licitacionApi.explorer(selectedLicitacionId);
    setData(refreshed.data);
  };

  const handleGenerarPdf = async () => {
    if (!selectedLicitacionId) return;

    setGeneratingPdf(true);

    try {
      await licitacionApi.generarChecklistPdf(selectedLicitacionId);
      toast.success('Checklist guardado en PDF en la biblioteca de este proceso');
      await onRefreshWorkspace?.();
      await refreshExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible generar el PDF del checklist'));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleUpload = async (item, file) => {
    if (!file) return;

    if (!selectedCompany?.id) {
      toast.error('No hay una empresa seleccionada. Vuelve a entrar a la empresa desde el menú superior.');
      return;
    }

    if (!selectedLicitacionId) {
      toast.error('Selecciona una licitación antes de subir el documento.');
      return;
    }

    setUploadingKey(item.key);

    try {
      await documentoApi.upload({
        empresaId: selectedCompany.id,
        licitacionId: selectedLicitacionId,
        file,
        nombre: item.nombre,
        tipoDocumento: item.categoria,
        descripcion: item.descripcion,
        tags: item.key,
        metaData: {
          checklist_key: item.key,
          checklist_nombre: item.nombre,
          origen: 'checklist',
        },
      });

      toast.success(`${item.nombre} cargado correctamente`);
      await onRefreshWorkspace?.();
      await refreshExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible cargar el documento'));
    } finally {
      setUploadingKey('');
    }
  };

  const handleDeleteDocumento = async (item) => {
    if (!item.documento_id) return;

    const confirmado = window.confirm(
      `¿Eliminar "${item.documento_nombre || item.nombre}"? Podrás volver a cargarlo después.`
    );
    if (!confirmado) return;

    setUploadingKey(item.key);

    try {
      await documentoApi.delete(item.documento_id);
      toast.success('Documento eliminado');
      await onRefreshWorkspace?.();
      await refreshExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar el documento'));
    } finally {
      setUploadingKey('');
    }
  };

  const handleExcludeObligatorio = async (item) => {
    if (!selectedLicitacionId) return;

    const confirmado = window.confirm(
      `¿Quitar "${item.nombre}" del checklist de esta licitación? Ya no se pedirá aquí (podrá seguir subiéndose desde otras pantallas).`
    );
    if (!confirmado) return;

    setUploadingKey(item.key);

    try {
      await licitacionApi.excluirChecklistObligatorio(selectedLicitacionId, item.key);
      toast.success('Documento quitado del checklist');
      await refreshExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible quitar el documento del checklist'));
    } finally {
      setUploadingKey('');
    }
  };

  const handleAddRequisito = async (event) => {
    event.preventDefault();
    if (!newRequisitoNombre.trim() || !selectedLicitacionId) return;

    setSavingRequisito(true);

    try {
      await requisitoApi.create(selectedLicitacionId, {
        nombre: newRequisitoNombre.trim(),
        tipo: 'global',
        obligatorio: newRequisitoObligatorio,
      });
      setNewRequisitoNombre('');
      setNewRequisitoObligatorio(true);
      toast.success('Requisito agregado al checklist');
      await refreshExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible agregar el requisito'));
    } finally {
      setSavingRequisito(false);
    }
  };

  const handleDeleteRequisito = async (requisitoId) => {
    try {
      await requisitoApi.remove(selectedLicitacionId, requisitoId);
      await refreshExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar el requisito'));
    }
  };

  const handleAddSuggestion = async (texto) => {
    setAddingSuggestion(texto);

    try {
      await requisitoApi.create(selectedLicitacionId, {
        nombre: texto.slice(0, 200),
        tipo: 'global',
        obligatorio: true,
        creado_por_ia: true,
      });
      toast.success('Sugerencia agregada al checklist');
      await refreshExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible agregar la sugerencia'));
    } finally {
      setAddingSuggestion('');
    }
  };

  return (
    <div className="page-stack">
      <section className="surface-panel surface-panel--hero">
        <div className="surface-panel__header surface-panel__header--hero">
          <div>
            <div className="section-badge">
              <FileStack size={14} />
              Checklist Inteligente
            </div>
            <p>Agrega los Requisitos De Cada Una de las Licitaciones.</p>
          </div>

          <div className="toolbar-actions">
            <LicitacionSelector
              selectedCompany={selectedCompany}
              isAdmin={isAdmin}
              selectedLicitacionId={selectedLicitacionId}
              onSelectLicitacion={onSelectLicitacion}
            />
            <button className="btn btn--secondary" onClick={() => onNavigate?.('biblioteca')} type="button">
              Ver biblioteca
            </button>
            <button
              className="btn btn--primary"
              type="button"
              onClick={handleGenerarPdf}
              disabled={!selectedLicitacionId || generatingPdf}
              title="Guarda un PDF del estado actual del checklist en la biblioteca de este proceso"
            >
              {generatingPdf ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
              {generatingPdf ? 'Generando...' : 'Generar PDF del checklist'}
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="alert alert--danger">{error}</div> : null}

      {loading ? (
        <div className="loading-block">
          <Loader2 size={26} className="spin" />
          <span>Analizando checklist y documentos cargados...</span>
        </div>
      ) : null}

      {!selectedLicitacionId ? (
        <div className="empty-state">
          <CircleDotDashed size={30} />
          <h3>Selecciona una licitación</h3>
          <p>El checklist vive dentro de cada proceso.</p>
        </div>
      ) : (
        <>
          <section className="kpi-grid kpi-grid--compact">
            <article className="kpi-card kpi-card--success">
              <div className="kpi-card__icon">
                <CheckCircle2 size={20} />
              </div>
              <div className="kpi-card__body">
                <span>Cumplidos</span>
                <strong>{stats.obligatorios_cumplidos || 0}</strong>
              </div>
            </article>
            <article className="kpi-card kpi-card--warning">
              <div className="kpi-card__icon">
                <CircleDashed size={20} />
              </div>
              <div className="kpi-card__body">
                <span>Pendientes</span>
                <strong>{stats.obligatorios_pendientes || 0}</strong>
              </div>
            </article>
            <article className="kpi-card kpi-card--primary">
              <div className="kpi-card__icon">
                <FileStack size={20} />
              </div>
              <div className="kpi-card__body">
                <span>Cobertura</span>
                <strong>{stats.cobertura_porcentaje || 0}%</strong>
              </div>
            </article>
            <article className="kpi-card kpi-card--danger">
              <div className="kpi-card__icon">
                <Upload size={20} />
              </div>
              <div className="kpi-card__body">
                <span>Documentos</span>
                <strong>{stats.total_documentos || 0}</strong>
              </div>
            </article>
          </section>

          <section className="surface-panel">
            <div className="surface-panel__header">
              <div>
                <h3>Documentos obligatorios</h3>
                <p>Cuando subes un archivo, el estado pasa a verde .</p>
              </div>
              <div className={`status-chip status-chip--${progress >= 100 ? 'success' : 'warning'}`}>
                {progress}% completado
              </div>
            </div>

            <div className="checklist-table">
              <div className="checklist-table__head">
                <span>Documento</span>
                <span>Categoría</span>
                <span>Estado</span>
                <span>Acción</span>
              </div>

              {items.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  <CircleDotDashed size={24} />
                  <h3>Sin reglas detectadas</h3>
                  <p>Sube el pliego y el RUP para que el sistema empiece a validar documentos.</p>
                </div>
              ) : (
                items.map((item) => {
                  const tone = item.cumple ? 'success' : 'warning';

                  return (
                    <div key={item.key} className="checklist-row">
                      <div className="checklist-row__copy">
                        <strong>{item.nombre}</strong>
                        <span>{item.descripcion}</span>
                      </div>
                      <span className="checklist-row__category">{formatCategoria(item.categoria)}</span>
                      <span className={`status-chip status-chip--${tone}`}>
                        {item.cumple ? 'Cumple' : 'Pendiente'}
                      </span>
                      <div className="checklist-row__actions">
                      <label className="upload-chip">
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              handleUpload(item, file);
                            }
                            event.target.value = '';
                          }}
                          disabled={uploadingKey === item.key}
                        />
                        {uploadingKey === item.key ? 'Subiendo...' : 'Cargar'}
                      </label>

                      {item.cumple && item.documento_id ? (
                        <button
                          className="icon-btn icon-btn--ghost icon-btn--danger"
                          type="button"
                          style={{ flex: '0 0 auto' }}
                          onClick={() => handleDeleteDocumento(item)}
                          disabled={uploadingKey === item.key}
                          title="Eliminar el documento cargado (borra el archivo)"
                        >
                          <FileX size={16} />
                        </button>
                      ) : null}

                      {item.excluible ? (
                        <button
                          className="icon-btn icon-btn--ghost"
                          type="button"
                          style={{ flex: '0 0 auto' }}
                          onClick={() => handleExcludeObligatorio(item)}
                          disabled={uploadingKey === item.key}
                          title="Quitar del checklist (no borra ningún documento)"
                        >
                          <ListX size={16} />
                        </button>
                      ) : null}

                      {item.personalizado ? (
                        <button
                          className="icon-btn icon-btn--ghost"
                          type="button"
                          style={{ flex: '0 0 auto' }}
                          onClick={() => handleDeleteRequisito(item.requisito_id)}
                          title="Quitar requisito del checklist (no borra ningún documento)"
                        >
                          <ListX size={16} />
                        </button>
                      ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form className="analyzer-form" onSubmit={handleAddRequisito}>
              <label className="field">
                <span className="field__label">Agregar requisito específico de esta licitación</span>
                <div className="field__control">
                  <PlusCircle size={18} />
                  <input
                    value={newRequisitoNombre}
                    onChange={(event) => setNewRequisitoNombre(event.target.value)}
                    placeholder="Ej. Certificado ISO 9001 vigente"
                  />
                </div>
              </label>

              <div className="switch-row">
                <button
                  type="button"
                  className={`switch ${newRequisitoObligatorio ? 'switch--active' : ''}`}
                  onClick={() => setNewRequisitoObligatorio((value) => !value)}
                >
                  {newRequisitoObligatorio ? 'Obligatorio' : 'Opcional'}
                </button>

                <button className="btn btn--primary" type="submit" disabled={savingRequisito || !newRequisitoNombre.trim()}>
                  {savingRequisito ? 'Agregando...' : 'Agregar al checklist'}
                </button>
              </div>
            </form>
          </section>

          {suggestions.length > 0 ? (
            <section className="surface-panel">
              <div className="surface-panel__header">
                <div>
                  <div className="section-badge">
                    <Sparkles size={14} />
                    Sugerencias del pliego
                  </div>
                  <h3>Esto detectó el OCR como posibles requisitos.</h3>
                  <p>Revisa y agrega al checklist con un clic las que apliquen.</p>
                </div>
              </div>

              <div className="mini-checklist">
                {suggestions.map((texto) => (
                  <div key={texto} className="mini-checklist__item">
                    <Lightbulb size={16} className="text-accent" />
                    <div className="mini-checklist__copy">
                      <span>{texto}</span>
                    </div>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => handleAddSuggestion(texto)}
                      disabled={addingSuggestion === texto}
                    >
                      {addingSuggestion === texto ? 'Agregando...' : 'Agregar'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
};

export default Checklist;
