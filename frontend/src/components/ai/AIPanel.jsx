import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BrainCircuit, FileDown, FileSearch, Lightbulb, Loader2, Sparkles, Upload, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { documentoApi, downloadBlob, licitacionApi, normalizeApiError, requisitoApi } from '../../api/api';
import { resolverAperturaPliego } from '../../utils/pliego';
import IndicadoresFinancieros from './IndicadoresFinancieros';
import LicitacionSelector from '../shared/LicitacionSelector';
import PliegoViewerModal from '../licitaciones/PliegoViewerModal';

const NIVEL_COINCIDENCIA_LABEL = {
  clase: 'Coincide por clase',
  familia: 'Coincide por familia',
};

const DIAGNOSTICO_LABEL = {
  sin_codigos_pliego:
    'No se detectó ningún código UNSPSC en el pliego (formato "80 10 17 06: descripción"). Revisa que el pliego analizado sea el correcto o que el OCR haya leído bien esa sección.',
  sin_experiencias_rup:
    'No se detectó ninguna experiencia en el RUP (bloques "EXPERIENCIA No.X"). Revisa que el archivo del RUP sea el correcto o que el OCR haya leído bien esa sección.',
  experiencias_rup_sin_codigos:
    'Se detectaron experiencias en el RUP, pero ninguna trae un código UNSPSC legible. Revisa esa parte del documento.',
};

const TABS = [
  ['pliego', 'Analizar pliego'],
  ['unspsc', 'Analizar UNSPSC'],
  ['financiero', 'Capacidad financiera'],
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
  const [rupFile, setRupFile] = useState(null);
  const [analyzingPliego, setAnalyzingPliego] = useState(false);
  const [analyzingRup, setAnalyzingRup] = useState(false);
  const [activeTab, setActiveTab] = useState('pliego');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [codigosManual, setCodigosManual] = useState('');
  const [resultadoManual, setResultadoManual] = useState(null);
  const [lastRupFile, setLastRupFile] = useState(null);
  const [exportingManual, setExportingManual] = useState('');
  const [addingSuggestion, setAddingSuggestion] = useState('');
  const [pliegoViewer, setPliegoViewer] = useState({ open: false, documentoId: null, query: '' });

  // Al cambiar de licitacion, el analisis y los archivos seleccionados son de la
  // licitacion anterior: hay que arrancar desde cero.
  useEffect(() => {
    setData(null);
    setFile(null);
    setRupFile(null);
    setError('');
    setCodigosManual('');
    setResultadoManual(null);
    setLastRupFile(null);
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

  const analysis = data?.pliego_analisis || null;
  const comparativo = data?.comparativo_codigos || null;
  const requisitosObligatorios = data?.documentos_obligatorios || [];

  // Igual que en Checklist: no repetir una sugerencia que el usuario ya agrego al
  // checklist como requisito personalizado.
  const suggestions = useMemo(() => {
    const raw = analysis?.requisitos_sugeridos || [];
    const existentes = new Set(
      requisitosObligatorios.filter((item) => item.personalizado).map((item) => item.nombre.trim().toLowerCase())
    );
    return raw.filter((texto) => !existentes.has(texto.slice(0, 200).trim().toLowerCase()));
  }, [analysis, requisitosObligatorios]);

  const guardarDocumentoAnalizado = async (archivo, tipo, numeroSecop) => {
    if (!selectedCompany?.id) return;

    try {
      await documentoApi.upload({
        empresaId: selectedCompany.id,
        licitacionId: selectedLicitacionId,
        file: archivo,
        nombre: `${tipo === 'pliego' ? 'Pliego' : 'RUP'} ${numeroSecop || ''}`.trim(),
        tipoDocumento: tipo,
        tags: tipo,
      });
    } catch (uploadErr) {
      // Guardar el PDF real es una comodidad (permite abrirlo despues en la pagina exacta
      // de una sugerencia); si falla, el analisis igual queda guardado.
      console.warn(`No fue posible guardar el archivo del ${tipo} para verlo despues`, uploadErr);
    }
  };

  const runAnalyzePliego = async () => {
    if (!selectedLicitacionId || !file) {
      toast.error('Selecciona el archivo del pliego primero');
      return;
    }

    setAnalyzingPliego(true);
    setError('');

    try {
      const numeroSecop = data?.secop?.numero_secop || '';
      const pliegoResponse = await licitacionApi.analyzePliego(selectedLicitacionId, { file });
      const pliegoPayload = pliegoResponse.data;

      await licitacionApi.update(selectedLicitacionId, {
        pliego_texto: pliegoPayload.texto_completo || pliegoPayload.texto_preview || null,
        pliego_url: file.name,
      });

      await guardarDocumentoAnalizado(file, 'pliego', numeroSecop);

      toast.success('Pliego analizado correctamente');
      setFile(null);

      await onRefreshWorkspace?.();
      await reloadExplorer();
    } catch (err) {
      setError(normalizeApiError(err, 'No fue posible analizar el pliego'));
      toast.error(normalizeApiError(err, 'No fue posible analizar el pliego'));
    } finally {
      setAnalyzingPliego(false);
    }
  };

  const runAnalyzeRup = async () => {
    if (!selectedLicitacionId || !rupFile) {
      toast.error('Selecciona el archivo del RUP primero');
      return;
    }

    setAnalyzingRup(true);
    setError('');

    try {
      const numeroSecop = data?.secop?.numero_secop || '';

      // Los codigos UNSPSC en la practica solo aparecen dentro del RUP (el pliego casi
      // nunca los trae en un formato que se pueda extraer de forma confiable), asi que la
      // busqueda manual de codigos se cruza unicamente contra este archivo.
      const rupResponse = await licitacionApi.analyzePliego(selectedLicitacionId, { file: rupFile, codigosBusqueda: codigosManual });
      const rupPayload = rupResponse.data;

      await licitacionApi.update(selectedLicitacionId, {
        rup_texto: rupPayload.texto_completo || rupPayload.texto_preview || null,
        rup_url: rupFile.name,
      });

      await guardarDocumentoAnalizado(rupFile, 'rup', numeroSecop);

      setResultadoManual({
        codigosBuscados: rupPayload.codigos_busqueda || [],
        coincidencias: rupPayload.coincidencias || [],
      });
      // Se guarda para poder exportar el reporte (Excel/CSV) sin pedirle al usuario que
      // vuelva a seleccionar el mismo archivo que acaba de analizar.
      setLastRupFile(rupFile);

      toast.success('RUP analizado: revisa las coincidencias');
      setRupFile(null);

      await onRefreshWorkspace?.();
      await reloadExplorer();
    } catch (err) {
      setError(normalizeApiError(err, 'No fue posible analizar el RUP'));
      toast.error(normalizeApiError(err, 'No fue posible analizar el RUP'));
    } finally {
      setAnalyzingRup(false);
    }
  };

  // Buscar los codigos manuales no siempre debe exigir volver a subir el RUP: si ya se
  // analizo antes (queda guardado en la licitacion), se busca directo contra ese texto.
  // Solo hay que subir el archivo de nuevo cuando el usuario en verdad lo necesite (RUP
  // nuevo o distinto).
  const runBuscarEnRupGuardado = async () => {
    if (!selectedLicitacionId) return;

    if (!data?.licitacion?.rup_texto) {
      toast.error('Todavía no hay un RUP analizado para esta licitación. Sube el archivo al menos una vez.');
      return;
    }

    setAnalyzingRup(true);
    setError('');

    try {
      const response = await licitacionApi.buscarCodigosUnspsc(selectedLicitacionId, codigosManual);
      setResultadoManual({
        codigosBuscados: response.data.codigos_busqueda || [],
        coincidencias: response.data.coincidencias || [],
      });
      toast.success('Búsqueda completada sobre el RUP ya analizado');
    } catch (err) {
      setError(normalizeApiError(err, 'No fue posible buscar los códigos'));
      toast.error(normalizeApiError(err, 'No fue posible buscar los códigos'));
    } finally {
      setAnalyzingRup(false);
    }
  };

  const handleAnalizarUnspsc = () => (rupFile ? runAnalyzeRup() : runBuscarEnRupGuardado());

  const handleExportPdf = async () => {
    if (!selectedLicitacionId) return;

    setExportingPdf(true);

    try {
      const response = await licitacionApi.exportarComparativoPdf(selectedLicitacionId);
      downloadBlob(response.data, `coincidencias_${data?.secop?.numero_secop || selectedLicitacionId}.pdf`);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible exportar el PDF'));
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportManual = async (formato) => {
    if (!selectedLicitacionId || !lastRupFile) return;

    setExportingManual(formato);

    try {
      const response = await licitacionApi.exportPliegoAnalysis(selectedLicitacionId, {
        file: lastRupFile,
        codigosBusqueda: codigosManual,
        formato,
      });
      const numeroSecop = data?.secop?.numero_secop || selectedLicitacionId;
      downloadBlob(response.data, `coincidencias_unspsc_${numeroSecop}.${formato === 'csv' ? 'csv' : 'xlsx'}`);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible exportar el reporte'));
    } finally {
      setExportingManual('');
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
      await reloadExplorer();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible agregar la sugerencia'));
    } finally {
      setAddingSuggestion('');
    }
  };

  const handleVerEnPliego = (texto) => {
    const resultado = resolverAperturaPliego(data?.documentos || [], texto);
    if (!resultado.ok) {
      toast.error('Vuelve a analizar el pliego para poder verlo en el PDF (los análisis anteriores no guardaron el archivo).');
      return;
    }
    setPliegoViewer({ open: true, documentoId: resultado.documentoId, query: resultado.query });
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
            <h3>OCR del pliego: coincidencias UNSPSC contra el RUP.</h3>
            <p>Sube el pliego de condiciones y cruza automáticamente los códigos UNSPSC que exige contra las experiencias ya registradas en el RUP de esta licitación.</p>
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
          <p>La IA se activa por proceso y usa el pliego cargado para extraer señales reales.</p>
        </div>
      ) : (
        <>
          <div className="panel-tabs">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`panel-tabs__item ${activeTab === value ? 'panel-tabs__item--active' : ''}`}
                onClick={() => setActiveTab(value)}
              >
                {label}
                {value === 'financiero' && data?.indicadores_financieros?.some((item) => item.cumple === false) ? (
                  <span className="panel-tabs__badge panel-tabs__badge--danger">
                    {data.indicadores_financieros.filter((item) => item.cumple === false).length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {activeTab === 'pliego' ? (
            <section className="split-grid split-grid--wide">
              <article className="surface-panel">
                <div className="surface-panel__header">
                  <div>
                    <h3>Analizar pliego</h3>
                    <p>Usa OCR sobre el pliego de condiciones para extraer posibles requisitos del checklist.</p>
                  </div>
                </div>

                <div className="analyzer-form">
                  <label className="field field--required">
                    <span className="field__label">Archivo del pliego <span className="field__required">*</span></span>
                    <div className="field__control field__control--file">
                      <Upload size={18} />
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                        onChange={(event) => setFile(event.target.files?.[0] || null)}
                      />
                      <span>{file ? file.name : data?.licitacion?.pliego_url || 'Selecciona el pliego en PDF o imagen'}</span>
                    </div>
                  </label>

                  <button className="btn btn--primary btn--block" onClick={runAnalyzePliego} disabled={analyzingPliego} type="button">
                    {analyzingPliego ? 'Analizando...' : 'Analizar pliego'}
                    {!analyzingPliego ? <ArrowRight size={16} /> : null}
                  </button>
                </div>
              </article>

              <article className="surface-panel surface-panel--detail">
                {!analysis ? (
                  <div className="empty-state">
                    <Wand2 size={30} />
                    <h3>Sin análisis todavía</h3>
                    <p>Sube el pliego para ver qué detecta el OCR como posibles requisitos.</p>
                  </div>
                ) : (
                  <div className="info-block">
                    <div className="info-block__header">
                      <div>
                        <h4>
                          <Sparkles size={14} style={{ marginRight: 6 }} />
                          Sugerencias del pliego
                        </h4>
                        <p>Esto detectó el OCR como posibles requisitos. Revisa y agrega al checklist con un clic.</p>
                      </div>
                    </div>

                    {suggestions.length === 0 ? (
                      <div className="empty-inline">El OCR no detectó requisitos sugeridos en este pliego (o ya los agregaste todos).</div>
                    ) : (
                      <div className="mini-checklist">
                        {suggestions.map((texto) => (
                          <div key={texto} className="mini-checklist__item">
                            <Lightbulb size={16} className="text-accent" />
                            <button
                              type="button"
                              className="mini-checklist__copy mini-checklist__copy--clickable"
                              onClick={() => handleVerEnPliego(texto)}
                              title="Ver y subrayar en el PDF del pliego"
                            >
                              <span>{texto}</span>
                            </button>
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
                    )}
                  </div>
                )}
              </article>
            </section>
          ) : null}

          {activeTab === 'unspsc' ? (
            <section className="split-grid split-grid--wide">
              <article className="surface-panel">
                <div className="surface-panel__header">
                  <div>
                    <h3>Analizar UNSPSC</h3>
                    <p>Sube el RUP para cruzar sus experiencias contra los códigos UNSPSC del pliego, o escribe los códigos a mano.</p>
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
                        onChange={(event) => setRupFile(event.target.files?.[0] || null)}
                      />
                      <span>{rupFile ? rupFile.name : data?.licitacion?.rup_url || 'Sin archivo nuevo seleccionado'}</span>
                    </div>
                    <span className="field__hint">
                      {data?.licitacion?.rup_texto
                        ? 'Ya hay un RUP analizado para este proceso: no hace falta volver a subirlo salvo que quieras reemplazarlo.'
                        : 'Sube el RUP al menos una vez para poder buscar códigos contra sus experiencias.'}
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">Códigos UNSPSC a buscar en el RUP (opcional, hasta 10, uno por línea)</span>
                    <textarea
                      rows={5}
                      value={codigosManual}
                      onChange={(event) => setCodigosManual(event.target.value)}
                      placeholder={'Ejemplo:\n80101706\n43211500\n81112300'}
                    />
                    <span className="field__hint">
                      Los códigos UNSPSC casi nunca se pueden leer de forma confiable en el pliego: escríbelos aquí y se
                      buscan directamente en las experiencias del RUP.
                    </span>
                  </label>

                  <button className="btn btn--primary btn--block" onClick={handleAnalizarUnspsc} disabled={analyzingRup} type="button">
                    {analyzingRup ? 'Buscando...' : rupFile ? 'Analizar y comparar' : 'Buscar coincidencias'}
                    {!analyzingRup ? <ArrowRight size={16} /> : null}
                  </button>
                </div>
              </article>

              <article className="surface-panel surface-panel--detail">
                {!comparativo && !resultadoManual ? (
                  <div className="empty-state">
                    <Wand2 size={30} />
                    <h3>Sin análisis todavía</h3>
                    <p>Sube el RUP arriba. Si ya analizaste el pliego en la otra pestaña, aquí verás qué códigos ya acredita.</p>
                  </div>
                ) : (
                  <>
                    {comparativo ? (
                      <div className="info-block">
                        <div className="info-block__header">
                          <div>
                            <h4>Coincidencias automáticas</h4>
                            <p>Códigos que exige el pliego y que ya acredita el RUP.</p>
                          </div>
                          <div className="toolbar-actions">
                            <span className={`status-chip status-chip--${comparativo.codigos_comunes.length > 0 ? 'success' : 'warning'}`}>
                              {comparativo.codigos_comunes.length}/{comparativo.codigos_pliego_total} en común
                            </span>
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={handleExportPdf}
                              disabled={exportingPdf}
                              title="Descargar reporte en PDF"
                            >
                              {exportingPdf ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />}
                              {exportingPdf ? 'Generando...' : 'Descargar PDF'}
                            </button>
                          </div>
                        </div>

                        {comparativo.codigos_comunes.length === 0 ? (
                          <div className="empty-inline">
                            {DIAGNOSTICO_LABEL[comparativo.diagnostico] ||
                              'Ningún código que pide el pliego aparece todavía en las experiencias del RUP.'}
                          </div>
                        ) : (
                          <div className="analysis-list">
                            {comparativo.codigos_comunes.map((item) => (
                              <div key={item.codigo} className="analysis-list__item">
                                <strong>
                                  {item.codigo_formateado}
                                  {NIVEL_COINCIDENCIA_LABEL[item.nivel_coincidencia] ? (
                                    <span className="status-chip status-chip--neutral analysis-list__badge">
                                      {NIVEL_COINCIDENCIA_LABEL[item.nivel_coincidencia]}
                                    </span>
                                  ) : null}
                                </strong>
                                <span>{item.descripcion_pliego}</span>
                                <span>
                                  {item.experiencias_rup.map((exp) => `Exp. #${exp.experiencia_no} · ${exp.contratante}`).join(' — ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {comparativo.coincidencias_objeto?.length > 0 ? (
                          <div className="analysis-list" style={{ marginTop: 12 }}>
                            <strong style={{ fontSize: 13 }}>Coincidencias por objeto contractual</strong>
                            {comparativo.coincidencias_objeto.map((item) => (
                              <div key={item.experiencia_no} className="analysis-list__item">
                                <strong>Exp. #{item.experiencia_no} · {item.contratante}</strong>
                                <span>Palabras en común: {item.palabras_comunes.join(', ')}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="empty-inline">
                        Aún no hay un pliego analizado para comparar automáticamente (ve a la pestaña "Analizar pliego"). Puedes
                        seguir usando la búsqueda manual de códigos.
                      </div>
                    )}

                    {resultadoManual ? (
                      <div className="info-block">
                        <div className="info-block__header">
                          <div>
                            <h4>Coincidencias por códigos manuales (solo contra el RUP)</h4>
                            <p>Códigos que escribiste: {resultadoManual.codigosBuscados.join(', ') || '—'}</p>
                          </div>
                          <div className="toolbar-actions">
                            <span className={`status-chip status-chip--${resultadoManual.coincidencias.length > 0 ? 'success' : 'warning'}`}>
                              {resultadoManual.coincidencias.length} experiencia(s) con coincidencias
                            </span>
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => handleExportManual('xlsx')}
                              disabled={!lastRupFile || Boolean(exportingManual)}
                              title="Descargar reporte en Excel"
                            >
                              {exportingManual === 'xlsx' ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />}
                              Excel
                            </button>
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => handleExportManual('csv')}
                              disabled={!lastRupFile || Boolean(exportingManual)}
                              title="Descargar reporte en CSV"
                            >
                              {exportingManual === 'csv' ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />}
                              CSV
                            </button>
                          </div>
                        </div>

                        {resultadoManual.codigosBuscados.length === 0 ? (
                          <div className="empty-inline">Escribe al menos un código UNSPSC arriba y vuelve a analizar para buscarlo en el RUP.</div>
                        ) : resultadoManual.coincidencias.length === 0 ? (
                          <div className="empty-inline">Ninguna experiencia del RUP contiene los códigos que escribiste.</div>
                        ) : (
                          <div className="analysis-list">
                            {resultadoManual.coincidencias.map((item) => (
                              <div key={item.experiencia_no} className="analysis-list__item">
                                <strong>
                                  Exp. #{item.experiencia_no}
                                  <span className="status-chip status-chip--neutral analysis-list__badge">
                                    {item.cantidad_coincidencias} coincidencia(s)
                                  </span>
                                </strong>
                                <span>{item.contratante} · {item.contratista}</span>
                                <span>
                                  {item.detalle_coincidencias.map((det, index) => (
                                    <React.Fragment key={`${item.experiencia_no}-${det.codigo}-${index}`}>
                                      {index > 0 ? ' — ' : ''}
                                      {det.codigo}
                                      {det.descripcion ? ` - ${det.descripcion}` : ''}
                                      {NIVEL_COINCIDENCIA_LABEL[det.nivel_coincidencia] ? (
                                        <span className="status-chip status-chip--neutral analysis-list__badge">
                                          {NIVEL_COINCIDENCIA_LABEL[det.nivel_coincidencia]}
                                        </span>
                                      ) : null}
                                    </React.Fragment>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </article>
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
        </>
      )}

      <PliegoViewerModal
        open={pliegoViewer.open}
        documentoId={pliegoViewer.documentoId}
        query={pliegoViewer.query}
        onClose={() => setPliegoViewer({ open: false, documentoId: null, query: '' })}
      />
    </div>
  );
};

export default AIPanel;
