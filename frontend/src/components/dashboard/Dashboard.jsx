import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Files,
  FolderOpen,
  Landmark,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TimerReset,
  FileText,
  XCircle,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { documentoApi, licitacionApi, normalizeApiError } from '../../api/api';
import {
  formatCurrency,
  formatDateLong,
  formatDaysLeft,
  formatStatusLabel,
  getSemaforoLabel,
  getSemaforoTone,
  getStatusTone,
  toProperCase,
} from '../../utils/workspace';
import '../../styles/dashboard.css';

const DOC_ESTADO_META = {
  vencido: { tone: 'danger', label: 'Vencido' },
  por_vencer: { tone: 'warning', label: 'Vence pronto' },
  proximo: { tone: 'info', label: 'Próximo' },
  vigente: { tone: 'success', label: 'Vigente' },
};

const getDocEstadoMeta = (estado) => DOC_ESTADO_META[estado] || { tone: 'neutral', label: 'Sin estado' };

const KPI_CONFIG = [
  {
    key: 'activas',
    label: 'Licitaciones activas',
    icon: Files,
    tone: 'primary',
  },
  {
    key: 'proximas_cerrar',
    label: 'Próximas a cerrar',
    icon: TimerReset,
    tone: 'warning',
  },
  {
    key: 'documentos_vencer',
    label: 'Documentos por vencer',
    icon: AlertCircle,
    tone: 'danger',
  },
  {
    key: 'tasa_exito',
    label: 'Tasa de éxito',
    icon: TrendingUp,
    tone: 'success',
  },
];

const Dashboard = ({
  selectedCompany,
  isAdmin,
  selectedLicitacionId,
  onSelectLicitacion,
  onFocusLicitacion,
  onCreateLicitacion,
  refreshToken,
}) => {
  const [summary, setSummary] = useState(null);
  const [licitaciones, setLicitaciones] = useState([]);
  const [docsPorVencer, setDocsPorVencer] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [proximosCierres, setProximosCierres] = useState([]);
  const [loadingProximos, setLoadingProximos] = useState(false);
  const [proximosModalOpen, setProximosModalOpen] = useState(false);
  const [notificacionesModalOpen, setNotificacionesModalOpen] = useState(false);
  const [detalleLicitacion, setDetalleLicitacion] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [detalleError, setDetalleError] = useState('');
  const [semaforo, setSemaforo] = useState({ rojo: 0, naranja: 0, verde: 0, detalle: [] });
  const [semaforoModalColor, setSemaforoModalColor] = useState(null);
  const [configAlertas, setConfigAlertas] = useState(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ dias_rojo: 7, dias_naranja: 15 });
  const [savingConfig, setSavingConfig] = useState(false);
  const companyId = selectedCompany?.id;
  // Admin sin empresa seleccionada = vista global (agrega datos de todas las empresas).
  const isGlobalView = isAdmin && !companyId;

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const colombiaTime = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(now),
    [now]
  );

  const colombiaDate = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(now),
    [now]
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboard = async () => {
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
          setDocsPorVencer([]);
          setSummary(null);
          setLoading(false);
          return;
        }

        const config = { signal: controller.signal };
        const empresaParam = companyId ? { empresa_id: companyId } : {};
        const [summaryRes, licitacionesRes, docsRes, semaforoRes] = await Promise.all([
          licitacionApi.summary(empresaParam, config),
          licitacionApi.list({ ...empresaParam, limit: 8 }, config),
          documentoApi.porVencer({ ...empresaParam, dias: 90 }, config),
          licitacionApi.semaforo(empresaParam, config),
        ]);

        setSummary(summaryRes.data);
        setLicitaciones(Array.isArray(licitacionesRes.data) ? licitacionesRes.data : []);
        setDocsPorVencer(Array.isArray(docsRes.data) ? docsRes.data : []);
        setSemaforo(semaforoRes.data || { rojo: 0, naranja: 0, verde: 0, detalle: [] });

        if (isAdmin) {
          const configRes = await licitacionApi.getConfiguracionAlertas(config);
          setConfigAlertas(configRes.data);
          setConfigForm(configRes.data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(normalizeApiError(err, 'No fue posible cargar el dashboard'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      controller.abort();
    };
  }, [companyId, isGlobalView, refreshToken, isAdmin]);

  const handleSaveConfigAlertas = async () => {
    setSavingConfig(true);

    try {
      const payload = {
        dias_rojo: Number(configForm.dias_rojo) || 0,
        dias_naranja: Number(configForm.dias_naranja) || 0,
      };
      const response = await licitacionApi.updateConfiguracionAlertas(payload);
      setConfigAlertas(response.data);
      setEditingConfig(false);
      toast.success('Umbrales de alertas actualizados');

      const empresaParam = companyId ? { empresa_id: companyId } : {};
      const semaforoRes = await licitacionApi.semaforo(empresaParam);
      setSemaforo(semaforoRes.data || { rojo: 0, naranja: 0, verde: 0, detalle: [] });
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar los umbrales'));
    } finally {
      setSavingConfig(false);
    }
  };

  const stats = useMemo(() => {
    if (!summary) return [];

    return KPI_CONFIG.map((item) => {
      const value = summary[item.key];
      const displayValue =
        item.key === 'tasa_exito'
          ? `${Number(value || 0).toFixed(1)}%`
          : item.key === 'documentos_vencer'
            ? Number(value || 0)
            : Number(value || 0);

      return {
        ...item,
        value: displayValue,
      };
    });
  }, [summary]);

  const activeProcesses = licitaciones.slice(0, 5);
  const recentDocs = docsPorVencer.slice(0, 5);

  const notifCounts = useMemo(() => {
    const counts = { vencido: 0, por_vencer: 0, proximo: 0, vigente: 0 };
    docsPorVencer.forEach((doc) => {
      if (counts[doc.estado] !== undefined) counts[doc.estado] += 1;
    });
    return counts;
  }, [docsPorVencer]);

  const companyLabel = toProperCase(selectedCompany?.nombre) || (isGlobalView ? 'Todas las empresas' : 'Empresa no seleccionada');

  const openProximosCierres = async () => {
    setProximosModalOpen(true);
    setLoadingProximos(true);

    try {
      const empresaParam = companyId ? { empresa_id: companyId } : {};
      const response = await licitacionApi.proximosCierres({ ...empresaParam, limit: 20 });
      setProximosCierres(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setProximosCierres([]);
    } finally {
      setLoadingProximos(false);
    }
  };

  const closeProximosCierres = () => {
    setProximosModalOpen(false);
    setDetalleLicitacion(null);
    setDetalleError('');
  };

  const handleSelectProximo = async (licitacionId) => {
    setLoadingDetalle(true);
    setDetalleError('');

    try {
      const response = await licitacionApi.explorer(licitacionId);
      setDetalleLicitacion(response.data);
    } catch (err) {
      setDetalleError(normalizeApiError(err, 'No fue posible cargar el detalle del proceso'));
    } finally {
      setLoadingDetalle(false);
    }
  };

  const backToProximosList = () => {
    setDetalleLicitacion(null);
    setDetalleError('');
  };

  const irAlProceso = () => {
    if (!detalleLicitacion?.licitacion?.id) return;
    setProximosModalOpen(false);
    setDetalleLicitacion(null);
    if (onFocusLicitacion) {
      onFocusLicitacion(detalleLicitacion.licitacion.id);
    } else {
      onSelectLicitacion?.(detalleLicitacion.licitacion.id);
    }
  };

  const handleSelectSemaforoItem = (licitacionId) => {
    setSemaforoModalColor(null);
    if (onFocusLicitacion) {
      onFocusLicitacion(licitacionId);
    } else {
      onSelectLicitacion?.(licitacionId);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard__hero">
        <div className="dashboard__hero-text">
          <span className="dashboard__eyebrow">
            <Sparkles size={14} />
            Centro de control
          </span>
          <h1 className="dashboard__title">{companyLabel}</h1>
          <p className="dashboard__subtitle">
            Estado operativo, cierres cercanos y documentos por vencer, en un solo vistazo.
          </p>
        </div>

        <div className="dashboard__actions">
          <div className="dashboard__clock">
            <Clock size={16} />
            <div className="dashboard__clock-copy">
              <strong>{colombiaTime}</strong>
              <span>{colombiaDate} · Colombia</span>
            </div>
          </div>

          <button className="btn btn--primary" onClick={onCreateLicitacion} type="button">
            Crear licitación
          </button>
        </div>
      </header>

      {error ? <div className="dashboard__alert">{error}</div> : null}

      {loading ? (
        <div className="dashboard__loading">
          <RefreshCw size={20} className="spin" />
          <span>Cargando métricas...</span>
        </div>
      ) : (
        <>
          <section className="dashboard__stats" aria-label="Indicadores clave">
            {stats.map((item) => {
              const Icon = item.icon;
              const clickable = item.key === 'proximas_cerrar';
              const Tag = clickable ? 'button' : 'article';

              return (
                <Tag
                  key={item.key}
                  type={clickable ? 'button' : undefined}
                  className={`dashboard__stat dashboard__stat--${item.tone} ${clickable ? 'dashboard__stat--clickable' : ''}`}
                  onClick={clickable ? openProximosCierres : undefined}
                >
                  <span className="dashboard__stat-icon">
                    <Icon size={18} />
                  </span>
                  <div className="dashboard__stat-body">
                    <span className="dashboard__stat-label">{item.label}</span>
                    <strong className="dashboard__stat-value">{item.value}</strong>
                  </div>
                </Tag>
              );
            })}
          </section>

          <section className="dashboard__panel">
            <header className="dashboard__panel-header">
              <div className="dashboard__panel-header-row">
                <div>
                  <h2>Semáforo de alertas</h2>
                  <p>Licitaciones activas por nivel de riesgo (fechas próximas o subsanaciones pendientes).</p>
                </div>
                {isAdmin ? (
                  <button className="btn btn--ghost" type="button" onClick={() => setEditingConfig((value) => !value)}>
                    {editingConfig ? 'Cerrar' : 'Configurar umbrales'}
                  </button>
                ) : null}
              </div>
            </header>

            {editingConfig ? (
              <div className="field-grid field-grid--2" style={{ marginBottom: 16 }}>
                <label className="field">
                  <span className="field__label">Días para alerta roja (crítica)</span>
                  <input
                    type="number"
                    min="0"
                    value={configForm.dias_rojo}
                    onChange={(event) => setConfigForm((current) => ({ ...current, dias_rojo: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Días para alerta naranja (aviso)</span>
                  <input
                    type="number"
                    min="0"
                    value={configForm.dias_naranja}
                    onChange={(event) => setConfigForm((current) => ({ ...current, dias_naranja: event.target.value }))}
                  />
                </label>
                <div style={{ gridColumn: '1 / -1' }}>
                  <button className="btn btn--primary" type="button" onClick={handleSaveConfigAlertas} disabled={savingConfig}>
                    {savingConfig ? 'Guardando...' : 'Guardar umbrales'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="dashboard__stats" aria-label="Semáforo de alertas">
              <button
                type="button"
                className="dashboard__stat dashboard__stat--danger dashboard__stat--clickable"
                onClick={() => setSemaforoModalColor('rojo')}
                title="Ver licitaciones críticas"
              >
                <span className="dashboard__stat-icon">
                  <AlertTriangle size={18} />
                </span>
                <div className="dashboard__stat-body">
                  <span className="dashboard__stat-label">Críticas (rojo)</span>
                  <strong className="dashboard__stat-value">{semaforo.rojo}</strong>
                </div>
              </button>
              <button
                type="button"
                className="dashboard__stat dashboard__stat--warning dashboard__stat--clickable"
                onClick={() => setSemaforoModalColor('naranja')}
                title="Ver licitaciones en aviso"
              >
                <span className="dashboard__stat-icon">
                  <Clock size={18} />
                </span>
                <div className="dashboard__stat-body">
                  <span className="dashboard__stat-label">Aviso (naranja)</span>
                  <strong className="dashboard__stat-value">{semaforo.naranja}</strong>
                </div>
              </button>
              <button
                type="button"
                className="dashboard__stat dashboard__stat--success dashboard__stat--clickable"
                onClick={() => setSemaforoModalColor('verde')}
                title="Ver licitaciones normales"
              >
                <span className="dashboard__stat-icon">
                  <CheckCircle2 size={18} />
                </span>
                <div className="dashboard__stat-body">
                  <span className="dashboard__stat-label">Normal (verde)</span>
                  <strong className="dashboard__stat-value">{semaforo.verde}</strong>
                </div>
              </button>
            </div>

            <div className="dashboard__list dashboard__list--scroll">
              {(semaforo.detalle || []).length === 0 ? (
                <div className="dashboard__empty">
                  <CheckCircle2 size={26} />
                  <h3>Sin licitaciones en riesgo</h3>
                  <p>No hay procesos activos con alertas por ahora.</p>
                </div>
              ) : (
                semaforo.detalle.map((item) => (
                  <button
                    key={item.id}
                    className={`dashboard__row ${String(item.id) === String(selectedLicitacionId) ? 'dashboard__row--active' : ''}`}
                    onClick={() => handleSelectSemaforoItem(item.id)}
                    type="button"
                  >
                    <span className={`status-dot status-dot--${getSemaforoTone(item.semaforo)}`} />
                    <div className="dashboard__row-body">
                      <strong>{item.numero_secop || 'Sin número de proceso'}</strong>
                      <span>{toProperCase(item.entidad_contratante) || 'Entidad no definida'}</span>
                    </div>
                    <div className="dashboard__row-meta">
                      <span className={`status-chip status-chip--${getSemaforoTone(item.semaforo)}`}>
                        {getSemaforoLabel(item.semaforo)}
                      </span>
                      <span className="dashboard__row-date">
                        {item.dias_restantes === null || item.dias_restantes === undefined
                          ? 'Sin fecha próxima'
                          : formatDaysLeft(item.dias_restantes)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="dashboard__columns">
            <article className="dashboard__panel">
              <header className="dashboard__panel-header">
                <h2>Procesos recientes</h2>
                <p>Licitaciones activas y su ritmo de cierre.</p>
              </header>

              <div className="dashboard__list">
                {activeProcesses.length === 0 ? (
                  <div className="dashboard__empty">
                    <FolderOpen size={26} />
                    <h3>Sin licitaciones visibles</h3>
                    <p>Crea tu primera licitación para empezar a organizar documentos y checklist.</p>
                    <button className="btn btn--primary" onClick={onCreateLicitacion} type="button">
                      Nueva licitación
                    </button>
                  </div>
                ) : (
                  activeProcesses.map((licitacion) => {
                    const tone = getStatusTone(licitacion.estado);
                    const active = String(licitacion.id) === String(selectedLicitacionId);

                    return (
                      <button
                        key={licitacion.id}
                        className={`dashboard__row ${active ? 'dashboard__row--active' : ''}`}
                        onClick={() => onSelectLicitacion?.(licitacion.id)}
                        type="button"
                      >
                        <span className={`status-dot status-dot--${tone}`} />
                        <div className="dashboard__row-body">
                          <strong>{licitacion.numero_secop || 'Sin número de proceso'}</strong>
                          <span>{toProperCase(licitacion.entidad_contratante) || 'Entidad no definida'}</span>
                        </div>
                        <div className="dashboard__row-meta">
                          {licitacion.semaforo ? (
                            <span
                              className={`status-dot status-dot--${getSemaforoTone(licitacion.semaforo)}`}
                              title={`Semáforo: ${getSemaforoLabel(licitacion.semaforo)}`}
                            />
                          ) : null}
                          <span className={`status-chip status-chip--${tone}`}>{formatStatusLabel(licitacion.estado)}</span>
                          <span className="dashboard__row-date">
                            {licitacion.dias_restantes === null || licitacion.dias_restantes === undefined
                              ? 'Sin cierre'
                              : formatDaysLeft(licitacion.dias_restantes)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </article>

            <article className="dashboard__panel">
              <header className="dashboard__panel-header">
                <div className="dashboard__panel-header-row">
                  <div>
                    <h2>Notificaciones de documentos</h2>
                    <p>Vencidos, próximos a vencer y vigentes, de un vistazo.</p>
                  </div>
                  {docsPorVencer.length > recentDocs.length ? (
                    <button className="btn btn--ghost" type="button" onClick={() => setNotificacionesModalOpen(true)}>
                      Ver todas
                    </button>
                  ) : null}
                </div>

                {docsPorVencer.length > 0 ? (
                  <div className="dashboard__notif-summary">
                    <span className="dashboard__notif-count dashboard__notif-count--danger">
                      <AlertCircle size={12} /> {notifCounts.vencido} vencidos
                    </span>
                    <span className="dashboard__notif-count dashboard__notif-count--warning">
                      <Clock size={12} /> {notifCounts.por_vencer} por vencer
                    </span>
                    <span className="dashboard__notif-count dashboard__notif-count--info">
                      <CalendarDays size={12} /> {notifCounts.proximo} próximos
                    </span>
                    <span className="dashboard__notif-count dashboard__notif-count--success">
                      <CheckCircle2 size={12} /> {notifCounts.vigente} vigentes
                    </span>
                  </div>
                ) : null}
              </header>

              <div className="dashboard__list">
                {recentDocs.length === 0 ? (
                  <div className="dashboard__empty">
                    <CalendarDays size={26} />
                    <h3>Todo al día</h3>
                    <p>No hay documentos próximos a vencer.</p>
                  </div>
                ) : (
                  recentDocs.map((doc) => {
                    const meta = getDocEstadoMeta(doc.estado);
                    return (
                      <div key={doc.id} className="dashboard__row">
                        <span className="dashboard__row-icon">
                          <FileText size={15} />
                        </span>
                        <div className="dashboard__row-body">
                          <strong>{doc.nombre}</strong>
                          <span>{doc.empresa}</span>
                        </div>
                        <div className="dashboard__row-meta">
                          <span className={`status-chip status-chip--${meta.tone}`}>{meta.label}</span>
                          <span className="dashboard__row-date">{formatDaysLeft(doc.dias_restantes)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </section>

          <section className="dashboard__panel">
            <header className="dashboard__panel-header">
              <h2>Indicadores rápidos</h2>
              <p>Visión resumida del estado de operación.</p>
            </header>

            <div className="dashboard__metrics">
              <div className="dashboard__metric">
                <span>Total adjudicado</span>
                <strong>{formatCurrency(summary?.valor_adjudicado)}</strong>
              </div>
              <div className="dashboard__metric">
                <span>Empresas visibles</span>
                <strong>{summary?.total_empresas ?? 0}</strong>
              </div>
              <div className="dashboard__metric">
                <span>Usuarios activos</span>
                <strong>{summary?.total_usuarios ?? 0}</strong>
              </div>
              <div className="dashboard__metric">
                <span>Documentos por vencer</span>
                <strong>{summary?.documentos_vencer ?? 0}</strong>
              </div>
            </div>
          </section>
        </>
      )}

      {proximosModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeProximosCierres}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <TimerReset size={14} />
                  Próximas a cerrar
                </div>
                <h3>{detalleLicitacion ? 'Detalle del proceso' : 'Procesos con cierre más cercano.'}</h3>
              </div>
              {detalleLicitacion ? (
                <button className="icon-btn icon-btn--ghost" type="button" onClick={backToProximosList} title="Volver al listado">
                  <ArrowLeft size={18} />
                </button>
              ) : null}
              <button className="icon-btn icon-btn--ghost" type="button" onClick={closeProximosCierres}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              {loadingDetalle ? (
                <div className="dashboard__loading">
                  <Loader2 size={20} className="spin" />
                  <span>Cargando el detalle del proceso...</span>
                </div>
              ) : detalleError ? (
                <div className="dashboard__alert">{detalleError}</div>
              ) : detalleLicitacion ? (
                <div className="lic-detail-panel">
                  <div className="detail-hero detail-hero--compact">
                    <div className={`status-dot status-dot--${getStatusTone(detalleLicitacion.licitacion?.estado)}`} />
                    <div>
                      <h3>{detalleLicitacion.licitacion?.numero_secop || 'Proceso sin número'}</h3>
                      <p>{toProperCase(detalleLicitacion.licitacion?.entidad_contratante) || 'Entidad no definida'}</p>
                    </div>
                  </div>

                  <div className="lic-detail__stats">
                    <div className="lic-detail__stat">
                      <span>Estado</span>
                      <strong>{formatStatusLabel(detalleLicitacion.licitacion?.estado)}</strong>
                    </div>
                    <div className="lic-detail__stat">
                      <span>Cuantía</span>
                      <strong>{formatCurrency(detalleLicitacion.licitacion?.cuantia)}</strong>
                    </div>
                    <div className="lic-detail__stat">
                      <span>Cierre</span>
                      <strong>{formatDateLong(detalleLicitacion.licitacion?.fecha_cierre)}</strong>
                    </div>
                    <div className="lic-detail__stat">
                      <span>Checklist</span>
                      <strong>{detalleLicitacion.resumen_documental?.cobertura_porcentaje || 0}%</strong>
                    </div>
                  </div>

                  <div className="lic-detail__section">
                    <div className="lic-detail__section-header">
                      <h3>
                        <ListChecks size={14} /> Checklist de documentos
                      </h3>
                      <span>
                        {detalleLicitacion.resumen_documental?.obligatorios_cumplidos || 0}/
                        {detalleLicitacion.resumen_documental?.obligatorios_total || 0}
                      </span>
                    </div>
                    <div className="lic-progress">
                      <div
                        className="lic-progress__bar"
                        style={{ width: `${detalleLicitacion.resumen_documental?.cobertura_porcentaje || 0}%` }}
                      />
                    </div>
                    <div className="lic-checklist">
                      {(detalleLicitacion.documentos_obligatorios || []).map((item) => (
                        <div key={item.key} className="lic-checklist__item">
                          <span className={`status-dot status-dot--${item.cumple ? 'success' : 'neutral'}`} />
                          <div className="lic-checklist__copy">
                            <strong>{item.nombre}</strong>
                            <span>{item.documento_nombre || item.descripcion}</span>
                          </div>
                          <span className={`status-chip status-chip--${item.cumple ? 'success' : 'warning'}`}>
                            {item.cumple ? 'Listo' : 'Pendiente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {detalleLicitacion.indicadores_financieros?.length ? (
                    <div className="lic-detail__section">
                      <div className="lic-detail__section-header">
                        <h3>
                          <Landmark size={14} /> Indicadores financieros
                        </h3>
                      </div>
                      <div className="lic-checklist">
                        {detalleLicitacion.indicadores_financieros.map((item) => (
                          <div key={item.key} className="lic-checklist__item">
                            {item.cumple === null ? (
                              <span className="status-dot status-dot--neutral" />
                            ) : item.cumple ? (
                              <CheckCircle2 size={16} className="text-accent" />
                            ) : (
                              <XCircle size={16} style={{ color: 'var(--danger)' }} />
                            )}
                            <div className="lic-checklist__copy">
                              <strong>{item.nombre}</strong>
                              <span>
                                RUP: {item.valor_rup ?? 'Sin dato'} · Exigido: {item.valor_requerido ?? 'Sin dato'}
                              </span>
                            </div>
                            <span
                              className={`status-chip status-chip--${
                                item.cumple === null ? 'neutral' : item.cumple ? 'success' : 'danger'
                              }`}
                            >
                              {item.cumple === null ? 'Falta info' : item.cumple ? 'Cumple' : 'No cumple'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <button className="btn btn--primary btn--block" type="button" onClick={irAlProceso}>
                    <ArrowUpRight size={16} />
                    Ir a este proceso
                  </button>
                </div>
              ) : loadingProximos ? (
                <div className="dashboard__loading">
                  <Loader2 size={20} className="spin" />
                  <span>Cargando procesos...</span>
                </div>
              ) : proximosCierres.length === 0 ? (
                <div className="dashboard__empty">
                  <CalendarDays size={26} />
                  <h3>Nada próximo a cerrar</h3>
                  <p>No hay procesos con fecha de cierre programada en este momento.</p>
                </div>
              ) : (
                <div className="dashboard__list">
                  {proximosCierres.map((item) => {
                    const tone = getStatusTone(item.estado);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="dashboard__row"
                        onClick={() => handleSelectProximo(item.id)}
                      >
                        <span className={`status-dot status-dot--${tone}`} />
                        <div className="dashboard__row-body">
                          <strong>{toProperCase(item.entidad)}</strong>
                          <span>{item.objeto}</span>
                        </div>
                        <div className="dashboard__row-meta">
                          <span className={`status-chip status-chip--${tone}`}>{formatStatusLabel(item.estado)}</span>
                          <span className="dashboard__row-date">
                            {item.dias_restantes === null || item.dias_restantes === undefined
                              ? 'Sin cierre'
                              : formatDaysLeft(item.dias_restantes)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {notificacionesModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setNotificacionesModalOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <AlertCircle size={14} />
                  Notificaciones
                </div>
                <h3>Todos los documentos con seguimiento de vencimiento</h3>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setNotificacionesModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              {docsPorVencer.length === 0 ? (
                <div className="dashboard__empty">
                  <CalendarDays size={26} />
                  <h3>Todo al día</h3>
                  <p>No hay documentos próximos a vencer.</p>
                </div>
              ) : (
                <div className="dashboard__list">
                  {docsPorVencer.map((doc) => {
                    const meta = getDocEstadoMeta(doc.estado);
                    return (
                      <div key={doc.id} className="dashboard__row">
                        <span className="dashboard__row-icon">
                          <FileText size={15} />
                        </span>
                        <div className="dashboard__row-body">
                          <strong>{doc.nombre}</strong>
                          <span>{doc.empresa}</span>
                        </div>
                        <div className="dashboard__row-meta">
                          <span className={`status-chip status-chip--${meta.tone}`}>{meta.label}</span>
                          <span className="dashboard__row-date">{formatDaysLeft(doc.dias_restantes)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {semaforoModalColor ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setSemaforoModalColor(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <span className={`status-dot status-dot--${getSemaforoTone(semaforoModalColor)}`} />
                  Semáforo
                </div>
                <h3>Licitaciones en {getSemaforoLabel(semaforoModalColor).toLowerCase()}</h3>
                <p>Selecciona una para abrir su detalle completo.</p>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setSemaforoModalColor(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              {(() => {
                const items = (semaforo.detalle || []).filter((item) => item.semaforo === semaforoModalColor);
                if (items.length === 0) {
                  return (
                    <div className="dashboard__empty">
                      <CheckCircle2 size={26} />
                      <h3>Nada por aquí</h3>
                      <p>No hay licitaciones en este estado por ahora.</p>
                    </div>
                  );
                }

                return (
                  <div className="dashboard__list">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        className="dashboard__row"
                        type="button"
                        onClick={() => handleSelectSemaforoItem(item.id)}
                      >
                        <span className={`status-dot status-dot--${getSemaforoTone(item.semaforo)}`} />
                        <div className="dashboard__row-body">
                          <strong>{item.numero_secop || 'Sin número de proceso'}</strong>
                          <span>{toProperCase(item.entidad_contratante) || 'Entidad no definida'}</span>
                        </div>
                        <div className="dashboard__row-meta">
                          <span className={`status-chip status-chip--${getStatusTone(item.estado)}`}>
                            {formatStatusLabel(item.estado)}
                          </span>
                          <span className="dashboard__row-date">
                            {item.dias_restantes === null || item.dias_restantes === undefined
                              ? 'Sin fecha próxima'
                              : formatDaysLeft(item.dias_restantes)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
