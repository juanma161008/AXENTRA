import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FolderKanban, PieChart, RefreshCw, ShieldCheck } from 'lucide-react';
import { licitacionApi, normalizeApiError } from '../../api/api';
import { formatCurrency, formatStatusLabel, getStatusTone, toProperCase } from '../../utils/workspace';

const ReportsPanel = ({ selectedCompany, isAdmin, refreshToken }) => {
  const [summary, setSummary] = useState(null);
  const [licitaciones, setLicitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
        const config = { signal: controller.signal };
        const empresaParam = companyId ? { empresa_id: companyId } : {};
        const [summaryRes, listRes] = await Promise.all([
          licitacionApi.summary(empresaParam, config),
          licitacionApi.list({ ...empresaParam, limit: 50 }, config),
        ]);

        setSummary(summaryRes.data);
        setLicitaciones(Array.isArray(listRes.data) ? listRes.data : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(normalizeApiError(err, 'No fue posible cargar los reportes'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => {
      controller.abort();
    };
  }, [companyId, isGlobalView, refreshToken]);

  const stateDistribution = useMemo(() => {
    const counts = new Map();
    licitaciones.forEach((item) => {
      const key = item.estado || 'sin_estado';
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([estado, count]) => ({
      estado,
      count,
      percent: licitaciones.length ? (count / licitaciones.length) * 100 : 0,
    }));
  }, [licitaciones]);

  return (
    <div className="page-stack">
      <section className="surface-panel surface-panel--hero">
        <div className="surface-panel__header surface-panel__header--hero">
          <div>
            <div className="section-badge">
              <BarChart3 size={14} />
              Reportes
            </div>
            <h3>Lectura ejecutiva del negocio.</h3>
            <p>Un resumen claro para dirección: valor, estados, ritmo y documentos críticos.</p>
          </div>

          <div className="toolbar-actions">
            <button className="btn btn--secondary" type="button">
              <Download size={16} />
              Exportar
            </button>
            <button className="btn btn--ghost" type="button" disabled>
              <ShieldCheck size={16} />
              Revisado
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="alert alert--danger">{error}</div> : null}

      {loading ? (
        <div className="loading-block">
          <RefreshCw size={26} className="spin" />
          <span>Construyendo reportes ejecutivos...</span>
        </div>
      ) : null}

      <section className="kpi-grid">
        <article className="kpi-card kpi-card--primary">
          <div className="kpi-card__icon">
            <FolderKanban size={20} />
          </div>
          <div className="kpi-card__body">
            <span>Procesos totales</span>
            <strong>{summary?.total_licitaciones ?? 0}</strong>
          </div>
        </article>
        <article className="kpi-card kpi-card--success">
          <div className="kpi-card__icon">
            <PieChart size={20} />
          </div>
          <div className="kpi-card__body">
            <span>Tasa de éxito</span>
            <strong>{Number(summary?.tasa_exito || 0).toFixed(1)}%</strong>
          </div>
        </article>
        <article className="kpi-card kpi-card--warning">
          <div className="kpi-card__icon">
            <BarChart3 size={20} />
          </div>
          <div className="kpi-card__body">
            <span>Valor adjudicado</span>
            <strong>{formatCurrency(summary?.valor_adjudicado)}</strong>
          </div>
        </article>
        <article className="kpi-card kpi-card--danger">
          <div className="kpi-card__icon">
            <ShieldCheck size={20} />
          </div>
          <div className="kpi-card__body">
            <span>Documentos por vencer</span>
            <strong>{summary?.documentos_vencer ?? 0}</strong>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="surface-panel">
          <div className="surface-panel__header">
            <div>
              <h3>Distribución por estado</h3>
              <p>Lo que está corriendo, lo que ya cerró y lo que sigue en preparación.</p>
            </div>
          </div>

          <div className="bar-chart">
            {stateDistribution.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <PieChart size={28} />
                <h3>Sin datos</h3>
                <p>Crea licitaciones para ver la distribución por estado.</p>
              </div>
            ) : (
              stateDistribution.map((item) => (
                <div key={item.estado} className="bar-chart__row">
                  <div className="bar-chart__label">
                    <span>{formatStatusLabel(item.estado)}</span>
                    <strong>{item.count}</strong>
                  </div>
                  <div className="bar-track">
                    <div className={`bar-fill bar-fill--${getStatusTone(item.estado)}`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="surface-panel">
          <div className="surface-panel__header">
            <div>
              <h3>Procesos destacados</h3>
              <p>Procesos con mayor urgencia o cercanos a cierre.</p>
            </div>
          </div>

          <div className="report-list">
            {licitaciones.slice(0, 6).map((licitacion) => (
              <div key={licitacion.id} className="report-list__item">
                <div className="report-list__copy">
                  <strong>{licitacion.numero_secop || 'Sin proceso'}</strong>
                  <span>{toProperCase(licitacion.entidad_contratante) || 'Entidad no definida'}</span>
                </div>
                <div className="report-list__meta">
                  <span className={`status-chip status-chip--${getStatusTone(licitacion.estado)}`}>
                    {formatStatusLabel(licitacion.estado)}
                  </span>
                  <strong>{formatCurrency(licitacion.cuantia)}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
};

export default ReportsPanel;
