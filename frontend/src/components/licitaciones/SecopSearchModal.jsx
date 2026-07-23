import React, { useState } from 'react';
import { ExternalLink, Landmark, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { secopApi, normalizeApiError } from '../../api/api';
import { formatCurrency, formatDateLong, toProperCase } from '../../utils/workspace';

const SECOP_PORTAL_URL =
  'https://community.secop.gov.co/Public/Tendering/ContractNoticeManagement/Index?currentLanguage=es-CO&Page=login&Country=CO&SkinName=CCE';

// Busca procesos reales en el dataset abierto de SECOP II (datos.gov.co) sin salir de la
// app. El portal oficial de SECOP (community.secop.gov.co) no se puede incrustar aqui --
// su propia politica de seguridad (CSP frame-ancestors) solo permite que lo abran paginas
// del propio dominio secop.gov.co -- asi que para "verlo" de verdad se abre en pestana
// nueva; lo que si vive dentro de la app es esta busqueda y el prellenado del formulario.
const SecopSearchModal = ({ open, onClose, onUsarProceso }) => {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [buscoAlMenosUnaVez, setBuscoAlMenosUnaVez] = useState(false);

  const handleBuscar = async (event) => {
    event?.preventDefault();
    if (!query.trim()) return;

    setBuscando(true);
    try {
      const response = await secopApi.buscar(query.trim());
      setResultados(response.data?.resultados || []);
      setBuscoAlMenosUnaVez(true);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible consultar SECOP'));
    } finally {
      setBuscando(false);
    }
  };

  const handleUsar = (item) => {
    onUsarProceso?.({
      numeroSecop: item.numero_proceso || '',
      entidadContratante: toProperCase(item.entidad) || '',
      nitBase: item.nit_entidad || '',
      objetoContrato: item.objeto || '',
      cuantia: item.precio_base ? String(Math.round(Number(item.precio_base))) : '',
      urlSecop: item.url_proceso || '',
    });
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel modal-panel--xl" onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <div className="section-badge">
              <Landmark size={14} />
              SECOP II
            </div>
            <h3>Buscar un proceso real en SECOP</h3>
            <p>
              Consulta el dataset abierto de SECOP II por número de proceso, entidad, NIT u objeto. Muchas
              entidades reutilizan el mismo formato de número (SAMC-02-2026, CD-005...), así que combínalo con el
              nombre de la entidad o ciudad para acertar de una — y ojo con las tildes (Bogotá, Medellín), la
              búsqueda no las ignora.
            </p>
          </div>
          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-panel__body">
          <form className="lic-search secop-search__form" onSubmit={handleBuscar}>
            <Search size={16} />
            <input
              type="search"
              autoFocus
              placeholder="Ej. entidad, NIT, número de proceso u objeto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="btn btn--primary" type="submit" disabled={buscando || !query.trim()}>
              {buscando ? <Loader2 size={16} className="spin" /> : 'Buscar'}
            </button>
          </form>

          <a
            className="secop-search__portal-link"
            href={SECOP_PORTAL_URL}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={13} />
            Abrir el portal de SECOP en una pestaña nueva
          </a>

          {buscando ? (
            <div className="lic-loading">
              <Loader2 size={20} className="spin" />
              <span>Consultando SECOP...</span>
            </div>
          ) : buscoAlMenosUnaVez && resultados.length === 0 ? (
            <div className="lic-empty">
              <Search size={24} />
              <h3>Sin resultados</h3>
              <p>No se encontraron procesos en SECOP con ese texto. Prueba con otras palabras.</p>
            </div>
          ) : (
            <div className="secop-search__results">
              {resultados.map((item) => (
                <div key={item.id_proceso || `${item.numero_proceso}-${item.entidad}`} className="secop-search__item">
                  <div className="secop-search__item-main">
                    <strong>{toProperCase(item.entidad) || 'Entidad no definida'}</strong>
                    <span>{item.objeto || 'Sin objeto disponible'}</span>
                    <span className="secop-search__item-meta">
                      {item.numero_proceso ? `Proceso ${item.numero_proceso}` : null}
                      {item.modalidad ? ` · ${item.modalidad}` : ''}
                      {item.estado ? ` · ${item.estado}` : ''}
                    </span>
                  </div>

                  <div className="secop-search__item-side">
                    <strong>{formatCurrency(item.precio_base)}</strong>
                    <span>{formatDateLong(item.fecha_publicacion)}</span>
                    {item.url_proceso ? (
                      <a href={item.url_proceso} target="_blank" rel="noreferrer" className="secop-search__ver-link">
                        <ExternalLink size={12} />
                        Ver en SECOP
                      </a>
                    ) : null}
                  </div>

                  <button className="btn btn--secondary" type="button" onClick={() => handleUsar(item)}>
                    Usar para crear licitación
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecopSearchModal;
