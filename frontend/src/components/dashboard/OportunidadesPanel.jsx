import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Megaphone,
  PlusCircle,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { oportunidadApi, normalizeApiError } from '../../api/api';
import { formatDateLong, formatDateTime, formatDaysLeft, formatStatusLabel } from '../../utils/workspace';

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  revisada: 'Revisada',
  convertida: 'Convertida en licitación',
  descartada: 'Descartada',
};

const ESTADO_TONE = {
  pendiente: 'warning',
  revisada: 'neutral',
  convertida: 'success',
  descartada: 'danger',
};

// Dias que faltan para la fecha de presentacion (negativo si ya paso); null si no se
// registro fecha, para no inventarle una urgencia a un aviso que no la tiene.
const diasParaPresentacion = (fechaPresentacion) => {
  if (!fechaPresentacion) return null;
  const fecha = new Date(fechaPresentacion);
  if (Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
};

const tonoPorDias = (dias) => {
  if (dias === null) return 'neutral';
  if (dias < 0) return 'danger';
  if (dias <= 3) return 'danger';
  if (dias <= 7) return 'warning';
  return 'success';
};

// Reemplaza el flujo de "el gerente escribe un Word con la URL de SECOP y lo deja en una
// carpeta compartida, pero muchas veces se nos pasa mirarla y perdemos la licitación": un
// aviso rapido (URL + comentario libre) que cualquiera puede dejar y que queda visible de
// una vez al abrir el Dashboard, no escondido en una carpeta que hay que acordarse de
// revisar. Pensado para que sea muy simple de usar (dos campos, un boton).
const OportunidadesPanel = ({ selectedCompany, companyOptions = [], isAdmin = false, onUsarComoLicitacion }) => {
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [comentario, setComentario] = useState('');
  const [fechaPresentacion, setFechaPresentacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState('');
  const [asignandoId, setAsignandoId] = useState('');
  const [verTodas, setVerTodas] = useState(false);

  const companyId = selectedCompany?.id;

  const cargar = async (mostrarTodas) => {
    setLoading(true);
    try {
      const base = companyId ? { empresa_id: companyId } : {};
      const params = mostrarTodas ? base : { ...base, estado: 'pendiente' };
      const response = await oportunidadApi.list(params);
      setOportunidades(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible cargar las oportunidades'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(verTodas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, verTodas]);

  const abrirModal = () => {
    setUrl('');
    setComentario('');
    setFechaPresentacion('');
    setModalOpen(true);
  };

  const handleGuardar = async (event) => {
    event.preventDefault();
    if (!url.trim()) return;

    setGuardando(true);
    try {
      await oportunidadApi.create({
        // Sin empresa filtrada (admin en vista global) queda sin asignar: visible para
        // todos hasta que alguien la convierta en licitación de una empresa concreta.
        empresa_id: companyId || null,
        url_secop: url.trim(),
        comentario: comentario.trim() || null,
        fecha_presentacion: fechaPresentacion || null,
      });
      toast.success('Oportunidad guardada, ya la ve todo el equipo');
      setModalOpen(false);
      await cargar(verTodas);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible guardar la oportunidad'));
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarEstado = async (oportunidad, estado) => {
    setActualizandoId(oportunidad.id);
    try {
      await oportunidadApi.update(oportunidad.id, { estado });
      await cargar(verTodas);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible actualizar la oportunidad'));
    } finally {
      setActualizandoId('');
    }
  };

  const handleAsignarEmpresa = async (oportunidad, empresaId) => {
    setAsignandoId(oportunidad.id);
    try {
      await oportunidadApi.update(oportunidad.id, { empresa_id: empresaId || null });
      await cargar(verTodas);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible asignar la empresa'));
    } finally {
      setAsignandoId('');
    }
  };

  const handleUsarComoLicitacion = (oportunidad) => {
    const notas = [
      oportunidad.comentario ? `Oportunidad SECOP: ${oportunidad.comentario}` : '',
      oportunidad.fecha_presentacion ? `Fecha de presentación (según SECOP): ${formatDateLong(oportunidad.fecha_presentacion)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    onUsarComoLicitacion?.({ urlSecop: oportunidad.url_secop, notas }, oportunidad.id);
  };

  return (
    <section className="dashboard__panel dashboard__panel--oportunidades">
      <header className="dashboard__panel-header">
        <div>
          <h2>
            <Megaphone size={16} />
            Oportunidades SECOP
          </h2>
          <p>Avisos rápidos del equipo: pega la URL de SECOP y lo que quieras decir, sin depender de un Word compartido.</p>
        </div>
        <div className="oportunidad-panel__header-actions">
          <div className="panel-tabs">
            <button
              type="button"
              className={`panel-tabs__item ${!verTodas ? 'panel-tabs__item--active' : ''}`}
              onClick={() => setVerTodas(false)}
            >
              Pendientes
            </button>
            <button
              type="button"
              className={`panel-tabs__item ${verTodas ? 'panel-tabs__item--active' : ''}`}
              onClick={() => setVerTodas(true)}
            >
              Todas (con seguimiento)
            </button>
          </div>
          <button className="btn btn--primary" type="button" onClick={abrirModal}>
            <PlusCircle size={16} />
            Agregar oportunidad
          </button>
        </div>
      </header>

      {loading ? (
        <div className="dashboard__loading">
          <Loader2 size={18} className="spin" />
          <span>Cargando oportunidades...</span>
        </div>
      ) : oportunidades.length === 0 ? (
        <div className="dashboard__empty">
          <CheckCircle2 size={22} />
          <h3>{verTodas ? 'Sin oportunidades todavía' : 'Sin pendientes'}</h3>
          <p>{verTodas ? 'Nadie ha dejado avisos aquí todavía.' : 'No hay avisos por revisar en este momento.'}</p>
        </div>
      ) : (
        <div className="dashboard__list">
          {oportunidades.map((item) => {
            const dias = diasParaPresentacion(item.fecha_presentacion);
            const tono = tonoPorDias(dias);

            const resuelta = item.estado === 'convertida' || item.estado === 'descartada';

            return (
            <div key={item.id} className="oportunidad-item">
              <div className="oportunidad-item__main">
                <div className="oportunidad-item__top">
                  <a href={item.url_secop} target="_blank" rel="noreferrer" className="oportunidad-item__link">
                    <ExternalLink size={13} />
                    Ver en SECOP
                  </a>
                  <span className={`status-chip status-chip--${ESTADO_TONE[item.estado] || 'neutral'}`}>
                    {ESTADO_LABEL[item.estado] || item.estado}
                  </span>
                </div>
                {item.comentario ? <p>{item.comentario}</p> : null}
                <span className="oportunidad-item__meta">
                  {item.creado_por_nombre || 'Alguien del equipo'} · {formatDateTime(item.created_at)}
                </span>

                <div className="oportunidad-item__flow">
                  <span className="oportunidad-item__flow-step oportunidad-item__flow-step--done">
                    <CheckCircle2 size={12} />
                    Creada por {item.creado_por_nombre || 'alguien del equipo'}
                  </span>
                  <span className={`oportunidad-item__flow-step ${item.revisado_por_nombre ? 'oportunidad-item__flow-step--done' : ''}`}>
                    {item.revisado_por_nombre ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                    {item.revisado_por_nombre ? `Revisada por ${item.revisado_por_nombre}` : 'Sin revisar todavía'}
                  </span>
                  {item.empresa_asignada_por_nombre ? (
                    <span className="oportunidad-item__flow-step oportunidad-item__flow-step--done">
                      <CheckCircle2 size={12} />
                      Empresa asignada por {item.empresa_asignada_por_nombre}
                    </span>
                  ) : null}
                  {item.licitacion_id ? (
                    <span className="oportunidad-item__flow-step oportunidad-item__flow-step--done">
                      <CheckCircle2 size={12} />
                      Convertida: {item.licitacion_numero_secop || 'proceso'} · {formatStatusLabel(item.licitacion_estado)}
                    </span>
                  ) : null}
                </div>

                {companyOptions.length > 0 ? (
                  <label className="oportunidad-item__empresa">
                    <span>Empresa:</span>
                    <select
                      value={item.empresa_id || ''}
                      disabled={asignandoId === item.id}
                      onChange={(event) => handleAsignarEmpresa(item, event.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {companyOptions.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {item.fecha_presentacion ? (
                  <span className={`status-chip status-chip--${tono} oportunidad-item__fecha`}>
                    <CalendarClock size={12} />
                    Presentación {formatDateLong(item.fecha_presentacion)} ({formatDaysLeft(dias)})
                  </span>
                ) : null}
              </div>

              {!resuelta ? (
                <div className="oportunidad-item__actions">
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={actualizandoId === item.id}
                    onClick={() => handleUsarComoLicitacion(item)}
                  >
                    <ArrowUpRight size={14} />
                    Crear licitación
                  </button>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={actualizandoId === item.id}
                    onClick={() => handleCambiarEstado(item, 'revisada')}
                  >
                    {actualizandoId === item.id ? <Loader2 size={14} className="spin" /> : 'Ya la vi'}
                  </button>
                  <button
                    className="icon-btn icon-btn--ghost"
                    type="button"
                    title="Descartar"
                    disabled={actualizandoId === item.id}
                    onClick={() => handleCambiarEstado(item, 'descartada')}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setModalOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <Megaphone size={14} />
                  Nueva oportunidad
                </div>
                <h3>Avísale al equipo</h3>
                <p>Pega el enlace de SECOP y escribe lo que quieras — así queda visible para todos, no solo en tu Word.</p>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form className="create-form modal-panel__body" onSubmit={handleGuardar}>
              <div className="form-section">
                {!companyId ? (
                  <p className="field__hint">
                    No tienes una empresa filtrada arriba: esta oportunidad quedará sin asignar y visible para todo el
                    equipo hasta que la conviertan en licitación de una empresa concreta.
                  </p>
                ) : null}

                <label className="field field--required">
                  <span className="field__label">URL de SECOP <span className="field__required">*</span></span>
                  <input
                    autoFocus
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://community.secop.gov.co/..."
                  />
                </label>

                <label className="field">
                  <span className="field__label">Fecha de presentación</span>
                  <input
                    type="date"
                    value={fechaPresentacion}
                    onChange={(event) => setFechaPresentacion(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="field__label">Comentario</span>
                  <textarea
                    rows={4}
                    value={comentario}
                    onChange={(event) => setComentario(event.target.value)}
                    placeholder="Ej: Este proceso cierra el viernes, revisar si aplicamos"
                  />
                </label>
              </div>
            </form>

            <div className="modal-panel__footer">
              <button className="btn btn--ghost" type="button" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn--primary" type="button" onClick={handleGuardar} disabled={guardando || !url.trim()}>
                {guardando ? <Loader2 size={16} className="spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default OportunidadesPanel;
