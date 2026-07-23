import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronRight,
  FileStack,
  FolderOpen,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  PlusCircle,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { licitacionApi, normalizeApiError } from '../../api/api';
import {
  formatCurrency,
  formatDateLong,
  formatDaysLeft,
  formatStatusLabel,
  getSemaforoLabel,
  getSemaforoTone,
  getStatusTone,
  hasPermission,
  toProperCase,
} from '../../utils/workspace';
import { resolverAperturaPliego } from '../../utils/pliego';
import Cronograma from './Cronograma';
import Checklist from '../checklist/Checklist';
import EditLicitacionModal from './EditLicitacionModal';
import PliegoViewerModal from './PliegoViewerModal';
import '../../styles/licitaciones.css';

const FILTERS = [
  ['all', 'Todas'],
  ['en_busqueda', 'En búsqueda'],
  ['en_preparacion', 'En preparación'],
  ['presentada', 'Presentadas'],
  ['adjudicada', 'Adjudicadas'],
];

const ESTADOS_OPCIONES = [
  ['en_busqueda', 'En búsqueda'],
  ['en_preparacion', 'En preparación'],
  ['presentada', 'Presentada'],
  ['adjudicada', 'Adjudicada'],
  ['perdida', 'Perdida'],
  ['desierta', 'Desierta'],
  ['cancelada', 'Cancelada'],
];

const TONE_VAR = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--text-muted)',
};

const LicitacionesPanel = ({
  selectedCompany,
  isAdmin,
  user,
  selectedLicitacionId,
  onSelectLicitacion,
  onCreateLicitacion,
  onNavigate,
  onRefreshWorkspace,
  refreshToken,
  pendingDetailId,
  onConsumePendingDetail,
}) => {
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [licitaciones, setLicitaciones] = useState([]);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [updatingEstado, setUpdatingEstado] = useState(false);
  const [togglingChecklistKey, setTogglingChecklistKey] = useState('');
  const [pliegoViewer, setPliegoViewer] = useState({ open: false, documentoId: null, query: '' });
  const companyId = selectedCompany?.id;
  const isGlobalView = isAdmin && !companyId;

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (!companyId && !isGlobalView) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
        if (companyId && !isUuid(companyId)) {
          setLicitaciones([]);
          setLoading(false);
          return;
        }

        const empresaParam = companyId ? { empresa_id: companyId } : {};
        const response = await licitacionApi.list({ ...empresaParam, limit: 100 }, { signal: controller.signal });
        const list = Array.isArray(response.data) ? response.data : [];
        setLicitaciones(list);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(normalizeApiError(err, 'No fue posible cargar las licitaciones'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => {
      controller.abort();
    };
  }, [companyId, isGlobalView, refreshToken]);

  const filtered = useMemo(() => {
    return licitaciones.filter((item) => {
      const matchesText =
        !query ||
        String(item.numero_secop || '').toLowerCase().includes(query.toLowerCase()) ||
        String(item.entidad_contratante || '').toLowerCase().includes(query.toLowerCase()) ||
        String(item.objeto_contrato || '').toLowerCase().includes(query.toLowerCase());

      const matchesState = stateFilter === 'all' || item.estado === stateFilter;
      return matchesText && matchesState;
    });
  }, [licitaciones, query, stateFilter]);

  const reloadDetail = async (signal) => {
    if (!selectedLicitacionId) {
      setSelectedDetail(null);
      return;
    }

    try {
      const response = await licitacionApi.explorer(selectedLicitacionId, signal ? { signal } : {});
      setSelectedDetail(response.data);
    } catch (err) {
      if (signal?.aborted) return;
      setSelectedDetail(null);
      setError(normalizeApiError(err, 'No fue posible abrir el detalle de la licitación'));
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    reloadDetail(controller.signal);
    return () => {
      controller.abort();
    };
  }, [selectedLicitacionId, refreshToken]);

  // Llegar aca desde afuera (p.ej. el semaforo del Dashboard) deja marcado un
  // pendingDetailId; en cuanto coincide con la licitacion ya seleccionada, se abre el
  // modal de detalle solo y se avisa al padre para que no se reabra despues por su cuenta.
  useEffect(() => {
    if (pendingDetailId && String(pendingDetailId) === String(selectedLicitacionId)) {
      setDetailOpen(true);
      onConsumePendingDetail?.();
    }
  }, [pendingDetailId, selectedLicitacionId]);

  useEffect(() => {
    if (!detailOpen && !checklistModalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (checklistModalOpen) {
        setChecklistModalOpen(false);
      } else {
        setDetailOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailOpen, checklistModalOpen]);

  const selectedLicitacion = licitaciones.find((item) => String(item.id) === String(selectedLicitacionId)) || null;

  const canEditDatos = isAdmin || hasPermission(user, 'licitaciones.editar');
  const canEditFechas = isAdmin || hasPermission(user, 'licitaciones.editar_fechas');
  const canDelete = isAdmin || hasPermission(user, 'licitaciones.eliminar');

  const checklistStats = selectedDetail?.resumen_documental || {
    total_documentos: 0,
    obligatorios_total: 0,
    obligatorios_cumplidos: 0,
    cobertura_porcentaje: 0,
  };

  const openDetail = (id) => {
    onSelectLicitacion?.(id);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setChecklistModalOpen(false);
  };

  const handleChangeEstado = async (event) => {
    const nuevoEstado = event.target.value;
    if (!selectedLicitacion || nuevoEstado === selectedLicitacion.estado) return;

    setUpdatingEstado(true);

    try {
      await licitacionApi.update(selectedLicitacion.id, { estado: nuevoEstado });
      setLicitaciones((current) =>
        current.map((item) => (String(item.id) === String(selectedLicitacion.id) ? { ...item, estado: nuevoEstado } : item))
      );
      toast.success('Estado actualizado');
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar el estado'));
    } finally {
      setUpdatingEstado(false);
    }
  };

  const handleToggleChecklistItem = async (item, checked) => {
    if (!selectedLicitacionId) return;

    setTogglingChecklistKey(item.key);

    try {
      await licitacionApi.actualizarChecklistItem(selectedLicitacionId, item.key, { cumplido: checked });
      await reloadDetail();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar el checklist'));
    } finally {
      setTogglingChecklistKey('');
    }
  };

  const handleDeleteLicitacion = async (licitacion, event) => {
    event?.stopPropagation();
    if (!licitacion?.id) return;

    const confirmado = window.confirm(
      `¿Eliminar la licitación "${licitacion.numero_secop || 'sin número'}"? Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    setDeletingId(licitacion.id);

    try {
      await licitacionApi.remove(licitacion.id);
      setLicitaciones((current) => current.filter((item) => item.id !== licitacion.id));
      toast.success('Licitación eliminada');
      if (String(selectedLicitacionId) === String(licitacion.id)) {
        setDetailOpen(false);
        onSelectLicitacion?.(null);
      }
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar la licitación'));
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="lic-page">
      <section className="lic-toolbar">
        <div className="lic-toolbar__top">
          <div className="lic-toolbar__intro">
            <span className="lic-toolbar__badge">
              <FileStack size={13} />
              Licitaciones
            </span>
            <p>Busca, filtra y abre el detalle documental de cualquier licitación en segundos.</p>
          </div>

          <div className="lic-toolbar__actions">
            <button className="btn btn--primary" onClick={onCreateLicitacion} type="button">
              <PlusCircle size={16} />
              Nueva Licitación
            </button>
            <button className="btn btn--secondary" onClick={() => onNavigate?.('biblioteca')} type="button">
              <FolderOpen size={16} />
              Biblioteca
            </button>
          </div>
        </div>

        <div className="lic-toolbar__filters">
          <label className="lic-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Buscar por proceso, entidad u objeto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="lic-tabs">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                className={`lic-tabs__item ${stateFilter === value ? 'lic-tabs__item--active' : ''}`}
                onClick={() => setStateFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? <div className="lic-alert">{error}</div> : null}

      {loading ? (
        <div className="lic-loading">
          <Loader2 size={20} className="spin" />
          <span>Recopilando licitaciones...</span>
        </div>
      ) : (
        <article className="lic-table-panel">
          <div className="lic-table-panel__header">
            <h2>Procesos</h2>
            <span>{filtered.length} resultados</span>
          </div>

          {filtered.length === 0 ? (
            <div className="lic-empty">
              <Sparkles size={26} />
              <h3>No hay licitaciones</h3>
              <p>Crea una licitación para empezar a cargar pliego, RUP y checklist.</p>
              <button className="btn btn--primary" onClick={onCreateLicitacion} type="button">
                Nueva licitación
              </button>
            </div>
          ) : (
            <>
              <div className="lic-table-head">
                <span style={{ flex: '1 1 220px' }}>Proceso</span>
                <span style={{ flex: '1 1 260px' }}>Objeto</span>
                <span className="lic-row__status">Estado</span>
                <span className="lic-row__amount" style={{ textAlign: 'right' }}>Cuantía</span>
                <span className="lic-row__days">Cierre</span>
                <span style={{ width: 66 }} />
              </div>

              <div className="lic-rows">
                {filtered.map((licitacion) => {
                  const tone = getStatusTone(licitacion.estado);

                  return (
                    <div key={licitacion.id} className="lic-row-wrapper">
                      <button
                        type="button"
                        className="lic-row"
                        style={{ '--tone-color': TONE_VAR[tone] }}
                        onClick={() => openDetail(licitacion.id)}
                      >
                        <div className="lic-row__main">
                          <strong>
                            {licitacion.semaforo ? (
                              <span
                                className={`status-dot status-dot--${getSemaforoTone(licitacion.semaforo)}`}
                                title={`Semáforo: ${getSemaforoLabel(licitacion.semaforo)}`}
                                style={{ marginRight: 6 }}
                              />
                            ) : null}
                            {licitacion.numero_secop || 'Sin proceso'}
                          </strong>
                          <span>{toProperCase(licitacion.entidad_contratante) || 'Entidad no definida'}</span>
                        </div>

                        <span className="lic-row__object">{licitacion.objeto_contrato || 'Sin objeto cargado todavía'}</span>

                        <span className="lic-row__status">
                          <span className={`status-chip status-chip--${tone}`}>{formatStatusLabel(licitacion.estado)}</span>
                        </span>

                        <strong className="lic-row__amount">{formatCurrency(licitacion.cuantia)}</strong>

                        <span className="lic-row__days">
                          <span className="status-chip status-chip--neutral">{formatDaysLeft(licitacion.dias_restantes)}</span>
                        </span>

                        <ChevronRight size={16} className="lic-row__chevron" />
                      </button>

                      {canDelete ? (
                        <button
                          type="button"
                          className="icon-btn icon-btn--ghost lic-row__delete"
                          title="Eliminar licitación"
                          disabled={deletingId === licitacion.id}
                          onClick={(event) => handleDeleteLicitacion(licitacion, event)}
                        >
                          {deletingId === licitacion.id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </article>
      )}

      {detailOpen && selectedLicitacion ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeDetail}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <ShieldCheck size={14} />
                  Proceso
                </div>
                <h3>{selectedLicitacion.numero_secop || 'Proceso sin número'}</h3>
                <p>{toProperCase(selectedLicitacion.entidad_contratante) || 'Entidad no definida'}</p>
              </div>

              <div className="lic-detail__header-actions">
                {canEditDatos ? (
                  <button
                    className="icon-btn icon-btn--ghost"
                    type="button"
                    title="Modificar licitación"
                    onClick={() => setEditModalOpen(true)}
                  >
                    <Pencil size={16} />
                  </button>
                ) : null}
                <button className="icon-btn icon-btn--ghost" type="button" onClick={closeDetail}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-panel__body">
              <div className="lic-detail-panel">
                <div className="lic-detail__badges">
                  <label
                    className={`lic-estado-select lic-estado-select--${getStatusTone(selectedLicitacion.estado)}`}
                    title="Cambiar el estado de la licitación"
                  >
                    <select value={selectedLicitacion.estado || 'en_busqueda'} onChange={handleChangeEstado} disabled={updatingEstado}>
                      {ESTADOS_OPCIONES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {updatingEstado ? <Loader2 size={12} className="spin" /> : null}
                  </label>
                  <span className="status-chip status-chip--neutral">{formatDaysLeft(selectedLicitacion.dias_restantes)}</span>
                  {(() => {
                    const semaforo = selectedDetail?.licitacion?.semaforo ?? selectedLicitacion.semaforo;
                    if (!semaforo) return null;
                    return (
                      <span className={`status-chip status-chip--${getSemaforoTone(semaforo)}`} title="Semáforo de alertas">
                        <span className={`status-dot status-dot--${getSemaforoTone(semaforo)}`} /> {getSemaforoLabel(semaforo)}
                      </span>
                    );
                  })()}
                </div>

                <div className="lic-detail__stats">
                  <div className="lic-detail__stat">
                    <span>Cuantía</span>
                    <strong>{formatCurrency(selectedLicitacion.cuantia)}</strong>
                  </div>
                  <div className="lic-detail__stat">
                    <span>Cierre</span>
                    <strong>{formatDateLong(selectedLicitacion.fecha_cierre)}</strong>
                  </div>
                  <div className="lic-detail__stat">
                    <span>Documento base</span>
                    <strong>{checklistStats.total_documentos || 0}</strong>
                  </div>
                  <div className="lic-detail__stat">
                    <span>Checklist</span>
                    <strong>{checklistStats.cobertura_porcentaje || 0}%</strong>
                  </div>
                </div>

                <Cronograma
                  licitacion={selectedDetail?.licitacion || selectedLicitacion}
                  isAdmin={canEditFechas}
                  onUpdated={() => reloadDetail()}
                />

                <div className="lic-detail__section">
                  <div className="lic-detail__section-header">
                    <h3>Checklist de documentos</h3>
                    <span>{checklistStats.obligatorios_cumplidos || 0}/{checklistStats.obligatorios_total || 0}</span>
                  </div>

                  <div className="lic-progress">
                    <div className="lic-progress__bar" style={{ width: `${checklistStats.cobertura_porcentaje || 0}%` }} />
                  </div>

                  <div className="lic-checklist">
                    {(selectedDetail?.documentos_obligatorios || []).slice(0, 6).map((item) => (
                      <div key={item.key} className="lic-checklist__item">
                        <input
                          type="checkbox"
                          className="lic-checklist__checkbox"
                          checked={Boolean(item.cumple)}
                          disabled={togglingChecklistKey === item.key}
                          onChange={(event) => handleToggleChecklistItem(item, event.target.checked)}
                          title="Marcar como cumplido"
                        />
                        <div className="lic-checklist__copy">
                          <strong>{item.nombre}</strong>
                          <span>{item.documento_nombre || item.descripcion}</span>
                          {item.cumple && item.validado_por_nombre ? (
                            <span className="lic-checklist__validado">Aprobado por {item.validado_por_nombre}</span>
                          ) : null}
                        </div>
                        <span className={`status-chip status-chip--${item.cumple ? 'success' : 'warning'}`}>
                          {item.cumple ? 'Listo' : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lic-detail__section">
                  <div className="lic-detail__section-header">
                    <h3>Acciones rápidas</h3>
                  </div>

                  <div className="lic-actions">
                    <button className="btn btn--secondary" onClick={() => setChecklistModalOpen(true)} type="button">
                      Ver checklist
                    </button>
                    <button className="btn btn--secondary" onClick={() => onNavigate?.('biblioteca')} type="button">
                      Abrir biblioteca
                    </button>
                    <button className="btn btn--primary" onClick={() => onNavigate?.('ia')} type="button">
                      <ArrowUpRight size={16} />
                      Revisar IA
                    </button>
                    {canDelete ? (
                      <button
                        className="btn btn--danger"
                        type="button"
                        disabled={deletingId === selectedLicitacion.id}
                        onClick={() => handleDeleteLicitacion(selectedLicitacion)}
                      >
                        {deletingId === selectedLicitacion.id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                        Eliminar licitación
                      </button>
                    ) : null}
                  </div>
                </div>

                {selectedDetail?.pliego_analisis ? (
                  <div className="lic-detail__section">
                    <div className="lic-detail__section-header">
                      <h3>Resumen del pliego</h3>
                    </div>
                    <button
                      type="button"
                      className="lic-pliego-preview lic-pliego-preview--clickable"
                      onClick={() => {
                        const preview = (selectedDetail.pliego_analisis.texto_preview || '').slice(0, 280);
                        const resultado = resolverAperturaPliego(selectedDetail?.documentos || [], preview);
                        if (!resultado.ok) {
                          toast.error('Vuelve a analizar el pliego desde IA para poder verlo en el PDF (los análisis anteriores no guardaron el archivo).');
                          return;
                        }
                        setPliegoViewer({ open: true, documentoId: resultado.documentoId, query: resultado.query });
                      }}
                    >
                      {(selectedDetail.pliego_analisis.texto_preview || 'Análisis disponible').slice(0, 280)}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {checklistModalOpen && selectedLicitacion ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setChecklistModalOpen(false)}>
          <div className="modal-panel modal-panel--xl" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div />
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setChecklistModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              <Checklist
                selectedCompany={selectedCompany}
                isAdmin={isAdmin}
                selectedLicitacionId={selectedLicitacionId}
                onSelectLicitacion={onSelectLicitacion}
                refreshToken={refreshToken}
                onRefreshWorkspace={onRefreshWorkspace}
                onNavigate={onNavigate}
              />
            </div>
          </div>
        </div>
      ) : null}

      <EditLicitacionModal
        open={editModalOpen}
        licitacion={selectedDetail?.licitacion || selectedLicitacion}
        onClose={() => setEditModalOpen(false)}
        onSaved={(licitacionActualizada) => {
          setLicitaciones((current) =>
            current.map((item) => (String(item.id) === String(licitacionActualizada.id) ? { ...item, ...licitacionActualizada } : item))
          );
          setEditModalOpen(false);
          reloadDetail();
        }}
      />

      <PliegoViewerModal
        open={pliegoViewer.open}
        documentoId={pliegoViewer.documentoId}
        query={pliegoViewer.query}
        titulo={`Pliego · ${selectedLicitacion?.numero_secop || ''}`}
        onClose={() => setPliegoViewer({ open: false, documentoId: null, query: '' })}
      />
    </div>
  );
};

export default LicitacionesPanel;
