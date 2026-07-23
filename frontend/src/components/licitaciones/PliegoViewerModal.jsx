import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileWarning, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import toast from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
// Vite resuelve esto a una URL estatica del worker de pdf.js (import ?url); sin asignar
// GlobalWorkerOptions.workerSrc, pdf.js intenta cargar el worker desde una ruta relativa
// que no existe en el bundle y el render nunca arranca.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { documentoApi, normalizeApiError } from '../../api/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.6;

// Visor de PDF embebido que salta directo a la pagina donde aparece el fragmento
// buscado y lo subraya en amarillo, en vez de abrir el archivo en una pestana nueva del
// navegador (que solo permite saltar de pagina, sin marcar nada).
const PliegoViewerModal = ({ open, documentoId, query, titulo, onClose }) => {
  const canvasRef = useRef(null);
  const highlightRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [rects, setRects] = useState([]);
  // Pagina donde en verdad se encontro el fragmento buscado; los rects solo aplican a esa
  // pagina especifica. Sin esto, al navegar a otra pagina el resaltado se seguia dibujando
  // ahi (mismas coordenadas, pagina distinta), marcando texto que no tiene nada que ver.
  const [highlightPage, setHighlightPage] = useState(null);
  const [scale, setScale] = useState(1.3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [sinPosicionExacta, setSinPosicionExacta] = useState(false);

  useEffect(() => {
    if (!open || !documentoId) return undefined;

    let cancelled = false;
    let objectUrl = '';

    const cargar = async () => {
      setLoading(true);
      setError('');
      setRects([]);
      setHighlightPage(null);
      setSinPosicionExacta(false);

      try {
        const [archivo, posicion] = await Promise.all([
          documentoApi.archivo(documentoId),
          query
            ? documentoApi.buscarPagina(documentoId, query)
            : Promise.resolve({ data: { pagina: null, rects: [] } }),
        ]);

        if (cancelled) return;

        objectUrl = URL.createObjectURL(archivo.data);
        setFileUrl(objectUrl);

        const doc = await pdfjsLib.getDocument(objectUrl).promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setPageNumber(posicion.data?.pagina || 1);
        setRects(posicion.data?.rects || []);
        setHighlightPage(posicion.data?.pagina || null);
        setSinPosicionExacta(Boolean(query) && !posicion.data?.pagina);
      } catch (err) {
        if (!cancelled) setError(normalizeApiError(err, 'No fue posible abrir el pliego'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    cargar();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, documentoId, query]);

  useEffect(() => {
    if (sinPosicionExacta) {
      toast('Se abrió el pliego, pero no se ubicó la posición exacta de este fragmento.');
    }
  }, [sinPosicionExacta]);

  useEffect(() => {
    if (!pdfDoc || !pageNumber) return undefined;
    let cancelled = false;

    const render = async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, scale]);

  const highlightVisible = rects.length > 0 && pageNumber === highlightPage;

  useEffect(() => {
    if (highlightVisible && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [highlightVisible, scale]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel modal-panel--xl pliego-viewer" onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <div className="section-badge">Pliego</div>
            <h3>{titulo || 'Resumen del pliego'}</h3>
            <p>
              {highlightVisible
                ? 'El fragmento resaltado es el que abriste desde el resumen.'
                : highlightPage
                ? `El fragmento resaltado está en la página ${highlightPage}; navega ahí para verlo.`
                : 'Navega el documento con los controles de abajo.'}
            </p>
          </div>

          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="pliego-viewer__toolbar">
          <button
            className="btn btn--secondary"
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft size={16} />
            Anterior
          </button>

          <span className="pliego-viewer__page-indicator">
            Página {pageNumber} de {pageCount || '—'}
          </span>

          <button
            className="btn btn--secondary"
            type="button"
            disabled={!pageCount || pageNumber >= pageCount}
            onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
          >
            Siguiente
            <ChevronRight size={16} />
          </button>

          <div className="pliego-viewer__zoom">
            <button
              className="icon-btn icon-btn--ghost"
              type="button"
              title="Alejar"
              disabled={scale <= MIN_SCALE}
              onClick={() => setScale((current) => Math.max(MIN_SCALE, +(current - 0.2).toFixed(2)))}
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="icon-btn icon-btn--ghost"
              type="button"
              title="Acercar"
              disabled={scale >= MAX_SCALE}
              onClick={() => setScale((current) => Math.min(MAX_SCALE, +(current + 0.2).toFixed(2)))}
            >
              <ZoomIn size={16} />
            </button>
          </div>

          {fileUrl ? (
            <a className="btn btn--secondary" href={fileUrl} download target="_blank" rel="noreferrer">
              <Download size={16} />
              Descargar
            </a>
          ) : null}
        </div>

        <div className="modal-panel__body pliego-viewer__body">
          {loading ? (
            <div className="lic-loading">
              <Loader2 size={20} className="spin" />
              <span>Abriendo el pliego...</span>
            </div>
          ) : error ? (
            <div className="lic-alert">
              <FileWarning size={16} />
              {error}
            </div>
          ) : (
            <div className="pliego-viewer__page">
              <canvas ref={canvasRef} />
              {highlightVisible
                ? rects.map((rect, index) => {
                    const [x0, y0, x1, y1] = rect;
                    return (
                      <div
                        key={index}
                        ref={index === 0 ? highlightRef : null}
                        className="pliego-viewer__highlight"
                        style={{
                          left: x0 * scale,
                          top: y0 * scale,
                          width: (x1 - x0) * scale,
                          height: (y1 - y0) * scale,
                        }}
                      />
                    );
                  })
                : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PliegoViewerModal;
