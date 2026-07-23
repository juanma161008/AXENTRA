import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Landmark, Loader2, Save, Upload, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { licitacionApi, normalizeApiError } from '../../api/api';

const parseNumber = (texto) => {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).trim();
  if (!limpio) return null;

  const tieneComa = limpio.includes(',');
  const tienePunto = limpio.includes('.');
  let normalizado = limpio;
  if (tieneComa && tienePunto) normalizado = limpio.replace(/\./g, '').replace(',', '.');
  else if (tieneComa) normalizado = limpio.replace(',', '.');

  const numero = parseFloat(normalizado);
  return Number.isNaN(numero) ? null : numero;
};

// Los indicadores "porcentaje" se digitan y muestran como 60, no como 0.60.
const toDisplayUnit = (item, valorCrudo) => {
  if (valorCrudo == null) return '';
  return item.unidad === 'porcentaje' ? String(Math.round(valorCrudo * 100)) : String(valorCrudo);
};

const toRawUnit = (item, textoDisplay) => {
  const numero = parseNumber(textoDisplay);
  if (numero == null) return null;
  return item.unidad === 'porcentaje' ? numero / 100 : numero;
};

const formatoLectura = (item, valorCrudo) => {
  if (valorCrudo == null) return '—';
  if (item.unidad === 'porcentaje') return `${Math.round(valorCrudo * 100)}%`;
  return valorCrudo.toFixed(2);
};

const IndicadoresFinancieros = ({ licitacionId, licitacion, indicadores = [], onSaved }) => {
  const [valoresRup, setValoresRup] = useState({});
  const [valoresRequeridos, setValoresRequeridos] = useState({});
  const [saving, setSaving] = useState(false);
  const [pliegoFile, setPliegoFile] = useState(null);
  const [rupFile, setRupFile] = useState(null);
  const [analizandoPliego, setAnalizandoPliego] = useState(false);
  const [analizandoRup, setAnalizandoRup] = useState(false);

  useEffect(() => {
    const rup = {};
    const requeridos = {};
    indicadores.forEach((item) => {
      if (item.fuente_rup === 'manual') rup[item.key] = toDisplayUnit(item, item.valor_rup);
      if (item.fuente_requerido === 'manual') requeridos[item.key] = toDisplayUnit(item, item.valor_requerido);
    });
    setValoresRup(rup);
    setValoresRequeridos(requeridos);
    setPliegoFile(null);
    setRupFile(null);
  }, [licitacionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // La tabla de "Comparación automática" antes solo mostraba lo que ya estaba guardado en
  // el servidor, así que escribir un valor arriba no se reflejaba abajo hasta darle
  // "Guardar indicadores" y recargar — muy poco intuitivo cuando ambas cosas están en la
  // misma pantalla. Aquí se recalcula el cumplimiento en vivo con lo que hay en los inputs
  // (o, si el campo está vacío, con lo último ya guardado/detectado por OCR).
  const indicadoresEnVivo = useMemo(() => {
    return indicadores.map((item) => {
      const requeridoTexto = valoresRequeridos[item.key];
      const rupTexto = valoresRup[item.key];

      const valorRequerido =
        requeridoTexto !== undefined && requeridoTexto !== '' ? toRawUnit(item, requeridoTexto) : item.valor_requerido;
      const valorRup = rupTexto !== undefined && rupTexto !== '' ? toRawUnit(item, rupTexto) : item.valor_rup;

      let cumple = null;
      if (valorRequerido !== null && valorRup !== null) {
        cumple = item.operador === '>=' ? valorRup >= valorRequerido : valorRup <= valorRequerido;
      }

      return { ...item, valor_requerido: valorRequerido, valor_rup: valorRup, cumple };
    });
  }, [indicadores, valoresRequeridos, valoresRup]);

  const resumen = useMemo(() => {
    const conDato = indicadoresEnVivo.filter((item) => item.cumple !== null);
    const cumplen = indicadoresEnVivo.filter((item) => item.cumple === true).length;
    return { total: indicadoresEnVivo.length, conDato: conDato.length, cumplen };
  }, [indicadoresEnVivo]);

  const analizarDocumento = async (file, tipo) => {
    if (!file || !licitacionId) return;

    const setAnalizando = tipo === 'pliego' ? setAnalizandoPliego : setAnalizandoRup;
    setAnalizando(true);

    try {
      const response = await licitacionApi.analyzePliego(licitacionId, { file });
      const payload = response.data;

      await licitacionApi.update(licitacionId, {
        [`${tipo}_texto`]: payload.texto_completo || payload.texto_preview || null,
        [`${tipo}_url`]: file.name,
      });

      toast.success(`${tipo === 'pliego' ? 'Pliego' : 'RUP'} analizado correctamente`);
      await onSaved?.();
    } catch (err) {
      toast.error(normalizeApiError(err, `No fue posible analizar el ${tipo === 'pliego' ? 'pliego' : 'RUP'}`));
    } finally {
      setAnalizando(false);
    }
  };

  const handleSave = async () => {
    if (!licitacionId) return;

    setSaving(true);

    try {
      const rupPayload = {};
      const requeridosPayload = {};
      indicadores.forEach((item) => {
        if (valoresRup[item.key] !== undefined) rupPayload[item.key] = toRawUnit(item, valoresRup[item.key]);
        if (valoresRequeridos[item.key] !== undefined) {
          requeridosPayload[item.key] = toRawUnit(item, valoresRequeridos[item.key]);
        }
      });

      await licitacionApi.update(licitacionId, {
        indicadores_financieros_rup_manual: rupPayload,
        indicadores_financieros_requeridos: requeridosPayload,
      });
      toast.success('Indicadores guardados');
      await onSaved?.();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible guardar los indicadores'));
    } finally {
      setSaving(false);
    }
  };

  if (!licitacionId) return null;

  const pliegoListo = Boolean(licitacion?.pliego_texto);
  const rupListo = Boolean(licitacion?.rup_texto);

  return (
    <section className="surface-panel">
      <div className="surface-panel__header">
        <div>
          <div className="section-badge">
            <Landmark size={14} />
            Capacidad financiera y organizacional
          </div>
          <h3>Compara los indicadores extraídos del pliego y del RUP.</h3>
          <p>Sube cada documento para que el OCR detecte sus indicadores, o escríbelos directamente en la tabla.</p>
        </div>
      </div>

      <div className="fin-columns">
        {[
          {
            tipo: 'pliego',
            titulo: 'PLIEGO',
            subtitulo: 'De la entidad contratante',
            file: pliegoFile,
            setFile: setPliegoFile,
            listo: pliegoListo,
            nombreArchivo: licitacion?.pliego_url,
            analizando: analizandoPliego,
            valores: valoresRequeridos,
            setValores: setValoresRequeridos,
            campoValor: 'valor_requerido',
            campoFuente: 'fuente_requerido',
            fuenteOcr: 'pliego_ocr',
          },
          {
            tipo: 'rup',
            titulo: 'RUP',
            subtitulo: 'De tu empresa',
            file: rupFile,
            setFile: setRupFile,
            listo: rupListo,
            nombreArchivo: licitacion?.rup_url,
            analizando: analizandoRup,
            valores: valoresRup,
            setValores: setValoresRup,
            campoValor: 'valor_rup',
            campoFuente: 'fuente_rup',
            fuenteOcr: 'rup_ocr',
          },
        ].map((col) => (
          <div key={col.tipo} className="fin-column">
            <div className="fin-column__header">
              <FileText size={15} />
              {col.titulo}
              <span className="fin-column__subtitle">{col.subtitulo}</span>
            </div>

            <label className="upload-zone fin-column__upload">
              <Upload size={16} />
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                onChange={(event) => col.setFile(event.target.files?.[0] || null)}
              />
              <strong>{col.file ? col.file.name : `Seleccionar ${col.titulo.toLowerCase()}`}</strong>
            </label>

            <button
              className="btn btn--secondary btn--block"
              type="button"
              disabled={!col.file || col.analizando}
              onClick={() => analizarDocumento(col.file, col.tipo)}
            >
              {col.analizando ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
              {col.analizando ? 'Analizando...' : `Analizar ${col.titulo.toLowerCase()}`}
            </button>

            <div className={`status-chip status-chip--${col.listo ? 'success' : 'neutral'} fin-column__status`}>
              {col.listo ? <CheckCircle2 size={13} /> : null}
              {col.listo ? `OCR procesado${col.nombreArchivo ? ` · ${col.nombreArchivo}` : ''}` : 'Sin analizar todavía'}
            </div>

            <div className="fin-column__table">
              <div className="fin-column__row fin-column__row--head">
                <span>Indicador</span>
                <span>Valor</span>
              </div>
              {indicadores.map((item) => (
                <div key={item.key} className="fin-column__row">
                  <span>{item.nombre}</span>
                  <input
                    value={col.valores[item.key] ?? ''}
                    onChange={(event) =>
                      col.setValores((current) => ({ ...current, [item.key]: event.target.value }))
                    }
                    placeholder={
                      item[col.campoFuente] === col.fuenteOcr && !col.valores[item.key]
                        ? toDisplayUnit(item, item[col.campoValor])
                        : item.unidad === 'porcentaje'
                        ? '%'
                        : '0.00'
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn--primary btn--block" type="button" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
        {saving ? 'Guardando...' : 'Guardar indicadores'}
      </button>

      <div className="info-block">
        <div className="info-block__header">
          <h4>Comparación automática</h4>
        </div>

        <div className="fin-comparativa">
          <div className="fin-comparativa__head">
            <span>Indicador</span>
            <span>Pliego</span>
            <span>RUP</span>
            <span>Estado</span>
          </div>

          {indicadoresEnVivo.map((item) => (
            <div key={item.key} className="fin-comparativa__row">
              <span className="fin-comparativa__nombre">{item.nombre}</span>

              <span className="fin-comparativa__valor">
                {item.operador === '>=' ? '≥ ' : '≤ '}
                {formatoLectura(item, item.valor_requerido)}
              </span>

              <span className="fin-comparativa__valor">{formatoLectura(item, item.valor_rup)}</span>

              {item.cumple === null ? (
                <span className="status-chip status-chip--neutral">Falta info</span>
              ) : item.cumple ? (
                <span className="status-chip status-chip--success">
                  <CheckCircle2 size={14} /> Cumple
                </span>
              ) : (
                <span className="status-chip status-chip--danger">
                  <XCircle size={14} /> No cumple
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="fin-progress">
          <div className="fin-progress__bar">
            <div
              className="fin-progress__fill"
              style={{ width: `${resumen.total ? (resumen.cumplen / resumen.total) * 100 : 0}%` }}
            />
          </div>
          <span>
            {resumen.cumplen}/{resumen.total} indicadores cumplen
          </span>
        </div>
      </div>
    </section>
  );
};

export default IndicadoresFinancieros;
