import React, { useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  Loader2,
  Upload,
  Wand2,
  ArrowRight,
  Info,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { licitacionApi, normalizeApiError } from '../../api/api';
import { formatStatusLabel, getStatusTone, toProperCase } from '../../utils/workspace';
import RequisitosIndicadores from './RequisitosIndicadores';
import IndicadoresFinancieros from './IndicadoresFinancieros';
import LicitacionSelector from '../shared/LicitacionSelector';

const TABS = [
  ['analizar', 'Analizar RUP'],
  ['comparativo', 'Pliego vs RUP'],
  ['financiero', 'Capacidad financiera'],
  ['indicadores', 'Indicadores del proceso'],
];

const AIPanel = ({
  selectedCompany,
  isAdmin,
  selectedLicitacionId,
  onSelectLicitacion,
  refreshToken,
  onRefreshWorkspace,
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [codigosBusqueda, setCodigosBusqueda] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisPreview, setAnalysisPreview] = useState(null);
  const [codigoDetalle, setCodigoDetalle] = useState(null);
  const [activeTab, setActiveTab] = useState('analizar');

  // Al cambiar de licitacion, el analisis, el archivo seleccionado y los codigos
  // de busqueda son de la licitacion anterior: hay que arrancar desde cero.
  useEffect(() => {
    setData(null);
    setAnalysisPreview(null);
    setFile(null);
    setCodigosBusqueda('');
    setError('');
  }, [selectedLicitacionId]);

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
        if (!cancelled) {
          setData(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(normalizeApiError(err, 'No fue posible cargar la IA'));
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

  const reloadExplorer = async () => {
    if (!selectedLicitacionId) return;
    const response = await licitacionApi.explorer(selectedLicitacionId);
    setData(response.data);
  };

  const analysis = analysisPreview || data?.rup_analisis || null;

  const resumen = analysis?.resumen || {};
  const coincidencias = analysis?.coincidencias || [];
  const experiencias = analysis?.experiencias || [];
  const codigosExtraidos = analysis?.codigos_extraidos || [];

  const metrics = useMemo(
    () => [
      { label: 'Experiencias', value: resumen.experiencias_detectadas || experiencias.length || 0 },
      { label: 'Códigos', value: resumen.codigos_extraidos || codigosExtraidos.length || 0 },
      { label: 'Coincidencias', value: resumen.coincidencias_detectadas || coincidencias.length || 0 },
      { label: 'SMMLV', value: resumen.smmlv_menciones || 0 },
    ],
    [resumen, experiencias.length, codigosExtraidos.length, coincidencias.length]
  );

  const runAnalysis = async () => {
    if (!selectedLicitacionId || !file) {
      toast.error('Selecciona el archivo del RUP primero');
      return;
    }

    setAnalyzing(true);
    setError('');

    try {
      const response = await licitacionApi.analyzePliego(selectedLicitacionId, {
        file,
        codigosBusqueda,
      });

      const payload = response.data;
      setAnalysisPreview(payload);
      toast.success('RUP analizado correctamente');

      await licitacionApi.update(selectedLicitacionId, {
        rup_texto: payload.texto_completo || payload.texto_preview || null,
        rup_url: file.name,
      });

      await onRefreshWorkspace?.();
    } catch (err) {
      setError(normalizeApiError(err, 'No fue posible analizar el RUP'));
      toast.error(normalizeApiError(err, 'No fue posible analizar el RUP'));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="surface-panel surface-panel--hero">
        <div className="surface-panel__header surface-panel__header--hero">
          <div>
            <div className="section-badge">
              <BrainCircuit size={14} />
              IA documental
            </div>
            <h3>OCR y extracción de experiencia UNSPSC desde el RUP.</h3>
            <p>Sube el certificado RUP (donde aparecen los bloques "EXPERIENCIA No.") para extraer códigos y compararlos con los que pide el proceso.</p>
          </div>

          <div className="toolbar-actions">
            <LicitacionSelector
              selectedCompany={selectedCompany}
              isAdmin={isAdmin}
              selectedLicitacionId={selectedLicitacionId}
              onSelectLicitacion={onSelectLicitacion}
            />
          </div>
        </div>
      </section>

      {error ? <div className="alert alert--danger">{error}</div> : null}

      {loading ? (
        <div className="loading-block">
          <Loader2 size={26} className="spin" />
          <span>Preparando análisis IA del proceso...</span>
        </div>
      ) : null}

      {!selectedLicitacionId ? (
        <div className="empty-state">
          <FileSearch size={30} />
          <h3>Selecciona una licitación</h3>
          <p>La IA se activa por proceso y usa el RUP cargado para extraer señales reales.</p>
        </div>
      ) : (
        <>
          <section className="kpi-grid kpi-grid--compact">
            {metrics.map((metric) => (
              <article key={metric.label} className="kpi-card kpi-card--primary">
                <div className="kpi-card__icon">
                  <CheckCircle2 size={20} />
                </div>
                <div className="kpi-card__body">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              </article>
            ))}
          </section>

          <div className="panel-tabs">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`panel-tabs__item ${activeTab === value ? 'panel-tabs__item--active' : ''}`}
                onClick={() => setActiveTab(value)}
              >
                {label}
                {value === 'comparativo' && data?.comparativo_codigos?.codigos_comunes.length ? (
                  <span className="panel-tabs__badge">{data.comparativo_codigos.codigos_comunes.length}</span>
                ) : null}
                {value === 'financiero' && data?.indicadores_financieros?.some((item) => item.cumple === false) ? (
                  <span className="panel-tabs__badge panel-tabs__badge--danger">
                    {data.indicadores_financieros.filter((item) => item.cumple === false).length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {activeTab === 'analizar' ? (
          <section className="split-grid split-grid--wide">
            <article className="surface-panel">
              <div className="surface-panel__header">
                <div>
                  <h3>Analizar RUP (experiencia UNSPSC)</h3>
                  <p>Usa OCR y coincidencia UNSPSC sobre el RUP para identificar experiencias y sus códigos. No es para el pliego del proceso.</p>
                </div>
              </div>

              <div className="analyzer-form">
                <label className="field">
                  <span className="field__label">Archivo del RUP</span>
                  <div className="field__control field__control--file">
                    <Upload size={18} />
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                    />
                    <span>{file ? file.name : 'Selecciona el RUP en PDF o imagen'}</span>
                  </div>
                </label>

                <label className="field">
                  <span className="field__label">Códigos UNSPSC para buscar</span>
                  <textarea
                    rows={5}
                    value={codigosBusqueda}
                    onChange={(event) => setCodigosBusqueda(event.target.value)}
                    placeholder="43211500
81112300
72151600"
                  />
                </label>

                <button className="btn btn--primary btn--block" onClick={runAnalysis} disabled={analyzing} type="button">
                  {analyzing ? 'Analizando...' : 'Analizar pliego'}
                  {!analyzing ? <ArrowRight size={16} /> : null}
                </button>
              </div>
            </article>

            <article className="surface-panel surface-panel--detail">
              {analysis ? (
                <>
                  <div className="detail-hero detail-hero--compact">
                    <div className={`status-dot status-dot--${getStatusTone(data?.secop?.estado || 'en_busqueda')}`} />
                    <div>
                      <h3>{data?.secop?.numero_secop || 'Proceso sin número'}</h3>
                      <p>{toProperCase(data?.secop?.entidad_contratante) || 'Entidad no definida'}</p>
                    </div>
                  </div>

                  <div className="detail-grid detail-grid--compact">
                    <div className="detail-tile">
                      <span>Estado</span>
                      <strong>{formatStatusLabel(data?.secop?.estado)}</strong>
                    </div>
                    <div className="detail-tile">
                      <span>Experiencias</span>
                      <strong>{resumen.experiencias_detectadas || experiencias.length || 0}</strong>
                    </div>
                    <div className="detail-tile">
                      <span>Coincidencias</span>
                      <strong>{resumen.coincidencias_detectadas || coincidencias.length || 0}</strong>
                    </div>
                    <div className="detail-tile">
                      <span>Texto</span>
                      <strong>{(analysis.texto_preview || '').length || 0} chars</strong>
                    </div>
                  </div>

                  <div className="info-block">
                    <div className="info-block__header">
                      <h4>Hallazgos</h4>
                    </div>
                    <div className="analysis-list">
                      {experiencias.slice(0, 4).map((exp) => (
                        <div key={exp.experiencia_no} className="analysis-list__item">
                          <strong>Experiencia #{exp.experiencia_no}</strong>
                          <span>{exp.total_codigos || 0} códigos UNSPSC</span>
                        </div>
                      ))}
                      {codigosExtraidos.slice(0, 6).map((codigo) => (
                        <button
                          key={`${codigo.experiencia_no}-${codigo.codigo}`}
                          type="button"
                          className="analysis-list__item analysis-list__item--clickable"
                          onClick={() =>
                            setCodigoDetalle({
                              codigo: codigo.codigo,
                              descripcion: codigo.descripcion,
                              origen: 'RUP',
                              experiencia_no: codigo.experiencia_no,
                              contratante: codigo.contratante,
                              contratista: codigo.contratista,
                              consecutivo_contrato: codigo.consecutivo_contrato,
                            })
                          }
                        >
                          <strong>{codigo.codigo}</strong>
                          <span>{codigo.descripcion}</span>
                          <Info size={14} className="analysis-list__item__icon" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="info-block">
                    <div className="info-block__header">
                      <h4>Coincidencias detectadas</h4>
                    </div>
                    <div className="analysis-list">
                      {coincidencias.length === 0 ? (
                        <div className="empty-inline">No hay coincidencias para los códigos ingresados.</div>
                      ) : (
                        coincidencias.slice(0, 6).map((item) => (
                          <div key={item.experiencia_no} className="analysis-list__item">
                            <strong>Experiencia #{item.experiencia_no}</strong>
                            <span>{item.codigos_encontrados?.join(', ')}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <Wand2 size={30} />
                  <h3>Sin análisis todavía</h3>
                  <p>Sube el RUP para generar OCR, experiencias y coincidencias.</p>
                </div>
              )}
            </article>
          </section>
          ) : null}

          {activeTab === 'comparativo' ? (
          <section className="surface-panel">
            <div className="surface-panel__header">
              <div>
                <div className="section-badge">
                  <CheckCircle2 size={14} />
                  Pliego vs RUP
                </div>
                <h3>Códigos que exige el pliego y que ya acredita el RUP.</h3>
                <p>Comparación automática, sin escribir códigos a mano: usa el texto del pliego y del RUP ya cargados en esta licitación.</p>
              </div>
              {data?.comparativo_codigos ? (
                <div
                  className={`status-chip status-chip--${
                    data.comparativo_codigos.codigos_comunes.length > 0 ? 'success' : 'warning'
                  }`}
                >
                  {data.comparativo_codigos.codigos_comunes.length}/{data.comparativo_codigos.codigos_pliego_total} en común
                </div>
              ) : null}
            </div>

            {!data?.comparativo_codigos ? (
              <div className="empty-state empty-state--compact">
                <FileSearch size={24} />
                <h3>Falta el pliego o el RUP</h3>
                <p>Sube el pliego (desde IA o al crear la licitación) y el RUP para ver los códigos en común automáticamente.</p>
              </div>
            ) : (
              <>
                <div className="info-block">
                  <div className="info-block__header">
                    <h4>Códigos en común</h4>
                  </div>
                  <div className="analysis-list">
                    {data.comparativo_codigos.codigos_comunes.length === 0 ? (
                      <div className="empty-inline">Ningún código del pliego aparece todavía en las experiencias del RUP.</div>
                    ) : (
                      data.comparativo_codigos.codigos_comunes.map((item) => (
                        <button
                          key={item.codigo}
                          type="button"
                          className="analysis-list__item analysis-list__item--clickable"
                          onClick={() =>
                            setCodigoDetalle({
                              codigo: item.codigo_formateado,
                              descripcion: item.descripcion_pliego,
                              origen: 'Pliego y RUP (en común)',
                              experiencias_rup: item.experiencias_rup,
                            })
                          }
                        >
                          <strong>{item.codigo_formateado}</strong>
                          <span>{item.descripcion_pliego}</span>
                          <Info size={14} className="analysis-list__item__icon" />
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {data.comparativo_codigos.codigos_faltantes.length > 0 ? (
                  <div className="info-block">
                    <div className="info-block__header">
                      <h4>Códigos del pliego que aún no acredita el RUP</h4>
                    </div>
                    <div className="analysis-list">
                      {data.comparativo_codigos.codigos_faltantes.map((item) => (
                        <button
                          key={item.codigo}
                          type="button"
                          className="analysis-list__item analysis-list__item--clickable"
                          onClick={() =>
                            setCodigoDetalle({
                              codigo: item.codigo_formateado,
                              descripcion: item.descripcion_pliego,
                              origen: 'Pliego (todavía sin coincidencia en el RUP)',
                            })
                          }
                        >
                          <strong>{item.codigo_formateado}</strong>
                          <span>{item.descripcion_pliego}</span>
                          <Info size={14} className="analysis-list__item__icon" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
          ) : null}

          {activeTab === 'financiero' ? (
            <IndicadoresFinancieros
              licitacionId={selectedLicitacionId}
              licitacion={data?.licitacion}
              indicadores={data?.indicadores_financieros || []}
              onSaved={reloadExplorer}
            />
          ) : null}

          {activeTab === 'indicadores' ? (
            <RequisitosIndicadores licitacionId={selectedLicitacionId} documentos={data?.documentos || []} />
          ) : null}
        </>
      )}

      {codigoDetalle ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setCodigoDetalle(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <Info size={14} />
                  Código UNSPSC
                </div>
                <h3>{codigoDetalle.codigo}</h3>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setCodigoDetalle(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              <div className="info-block">
                <div className="info-block__header">
                  <h4>Descripción</h4>
                </div>
                <p className="text-muted">{codigoDetalle.descripcion || 'Sin descripción detectada en el documento.'}</p>
              </div>

              <div className="metadata-list">
                <div>
                  <span>Origen</span>
                  <strong>{codigoDetalle.origen}</strong>
                </div>
                {codigoDetalle.experiencia_no ? (
                  <div>
                    <span>Experiencia</span>
                    <strong>#{codigoDetalle.experiencia_no}</strong>
                  </div>
                ) : null}
                {codigoDetalle.consecutivo_contrato ? (
                  <div>
                    <span>Consecutivo del contrato</span>
                    <strong>{codigoDetalle.consecutivo_contrato}</strong>
                  </div>
                ) : null}
                {codigoDetalle.contratante ? (
                  <div>
                    <span>Contratante</span>
                    <strong>{codigoDetalle.contratante}</strong>
                  </div>
                ) : null}
                {codigoDetalle.contratista ? (
                  <div>
                    <span>Contratista</span>
                    <strong>{codigoDetalle.contratista}</strong>
                  </div>
                ) : null}
              </div>

              {codigoDetalle.experiencias_rup?.length ? (
                <div className="info-block">
                  <div className="info-block__header">
                    <h4>Experiencias del RUP donde aparece</h4>
                  </div>
                  <div className="analysis-list">
                    {codigoDetalle.experiencias_rup.map((exp, index) => (
                      <div key={`${exp.experiencia_no}-${index}`} className="analysis-list__item">
                        <strong>Experiencia #{exp.experiencia_no}</strong>
                        <span>{exp.contratante} · {exp.contratista}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AIPanel;
