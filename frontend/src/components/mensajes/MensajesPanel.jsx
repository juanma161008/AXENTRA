import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, Mail, Megaphone, PenSquare, Send, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { mensajeApi, normalizeApiError } from '../../api/api';
import { formatDateTime } from '../../utils/workspace';

const TABS = [
  ['recibidos', 'Recibidos', Inbox],
  ['enviados', 'Enviados', Send],
];

const TIPO_META = {
  alerta: { label: 'Alerta crítica', icon: AlertTriangle, className: 'mensaje-item--alerta' },
  oportunidad: { label: 'Oportunidad', icon: Megaphone, className: 'mensaje-item--oportunidad' },
  checklist: { label: 'Checklist', icon: CheckCircle2, className: 'mensaje-item--checklist' },
};

// Mensajeria interna entre usuarios de la plataforma: un "correo local" (asunto + cuerpo,
// de un usuario a otro) que vive dentro de la app, sin depender de un servidor SMTP real.
// Autocontenido a proposito (icono + modal + estado) para poder montarlo una sola vez en
// el layout y que el contador de no leidos este siempre visible.
const MensajesPanel = () => {
  const [open, setOpen] = useState(false);
  const [carpeta, setCarpeta] = useState('recibidos');
  const [mensajes, setMensajes] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [noLeidos, setNoLeidos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [destinatarioId, setDestinatarioId] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargarNoLeidos = async () => {
    try {
      const response = await mensajeApi.noLeidos();
      setNoLeidos(response.data?.no_leidos || 0);
    } catch (err) {
      // El contador es una comodidad visual; si falla no vale la pena molestar al usuario.
    }
  };

  useEffect(() => {
    cargarNoLeidos();
    const interval = setInterval(cargarNoLeidos, 60000);
    return () => clearInterval(interval);
  }, []);

  const cargarMensajes = async (carpetaActual) => {
    setLoading(true);
    try {
      const response = await mensajeApi.list(carpetaActual);
      setMensajes(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible cargar los mensajes'));
    } finally {
      setLoading(false);
    }
  };

  const abrirPanel = async () => {
    setOpen(true);
    setExpandedId('');
    await cargarMensajes(carpeta);
  };

  const cambiarCarpeta = async (nuevaCarpeta) => {
    setCarpeta(nuevaCarpeta);
    setExpandedId('');
    await cargarMensajes(nuevaCarpeta);
  };

  const abrirComposer = async () => {
    setDestinatarioId('');
    setAsunto('');
    setCuerpo('');
    setComposerOpen(true);
    try {
      const response = await mensajeApi.contactos();
      setContactos(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible cargar la lista de contactos'));
    }
  };

  const handleExpandir = async (mensaje) => {
    const abriendo = expandedId !== mensaje.id;
    setExpandedId(abriendo ? mensaje.id : '');

    if (abriendo && carpeta === 'recibidos' && !mensaje.leido) {
      try {
        await mensajeApi.marcarLeido(mensaje.id);
        setMensajes((current) => current.map((item) => (item.id === mensaje.id ? { ...item, leido: true } : item)));
        cargarNoLeidos();
      } catch (err) {
        // Si falla marcar como leido no es grave; el mensaje se sigue viendo igual.
      }
    }
  };

  const handleEnviar = async (event) => {
    event.preventDefault();
    if (!destinatarioId || !cuerpo.trim()) return;

    setEnviando(true);
    try {
      await mensajeApi.create({ destinatario_id: destinatarioId, asunto: asunto.trim() || null, cuerpo: cuerpo.trim() });
      toast.success('Mensaje enviado');
      setComposerOpen(false);
      if (carpeta === 'enviados') await cargarMensajes('enviados');
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible enviar el mensaje'));
    } finally {
      setEnviando(false);
    }
  };

  const handleEliminar = async (mensaje, event) => {
    event.stopPropagation();
    try {
      await mensajeApi.remove(mensaje.id);
      setMensajes((current) => current.filter((item) => item.id !== mensaje.id));
      cargarNoLeidos();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar el mensaje'));
    }
  };

  return (
    <>
      <button className="icon-btn icon-btn--ghost mensajes-trigger" type="button" title="Mensajes internos" onClick={abrirPanel}>
        <Mail size={16} />
        {noLeidos > 0 ? <span className="mensajes-trigger__badge">{noLeidos > 9 ? '9+' : noLeidos}</span> : null}
      </button>

      {open
        ? createPortal(
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="modal-panel modal-panel--xl" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <Mail size={14} />
                  Mensajes
                </div>
                <h3>Mensajería interna</h3>
                <p>Escríbele a cualquier compañero de tu empresa sin salir de la plataforma.</p>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-panel__body">
              <div className="mensajes-toolbar">
                <div className="panel-tabs">
                  {TABS.map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      className={`panel-tabs__item ${carpeta === value ? 'panel-tabs__item--active' : ''}`}
                      onClick={() => cambiarCarpeta(value)}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btn btn--primary" type="button" onClick={abrirComposer}>
                  <PenSquare size={15} />
                  Nuevo mensaje
                </button>
              </div>

              {loading ? (
                <div className="lic-loading">
                  <Loader2 size={20} className="spin" />
                  <span>Cargando mensajes...</span>
                </div>
              ) : mensajes.length === 0 ? (
                <div className="lic-empty">
                  <Mail size={24} />
                  <h3>Sin mensajes</h3>
                  <p>{carpeta === 'recibidos' ? 'No tienes mensajes por ahora.' : 'No has enviado ningún mensaje todavía.'}</p>
                </div>
              ) : (
                <div className="mensajes-list">
                  {mensajes.map((mensaje) => {
                    const tipoMeta = TIPO_META[mensaje.tipo];
                    const TipoIcon = tipoMeta?.icon;

                    return (
                    <div
                      key={mensaje.id}
                      className={`mensaje-item ${!mensaje.leido && carpeta === 'recibidos' ? 'mensaje-item--no-leido' : ''} ${tipoMeta?.className || ''}`}
                      onClick={() => handleExpandir(mensaje)}
                    >
                      <div className="mensaje-item__header">
                        {tipoMeta ? (
                          <span className="mensaje-item__tipo">
                            <TipoIcon size={12} />
                            {tipoMeta.label}
                          </span>
                        ) : null}
                        <strong>
                          {carpeta === 'recibidos'
                            ? mensaje.remitente_nombre || 'Alguien del equipo'
                            : `Para: ${mensaje.destinatario_nombre || 'Alguien del equipo'}`}
                        </strong>
                        <span className="mensaje-item__fecha">{formatDateTime(mensaje.created_at)}</span>
                        <button
                          className="icon-btn icon-btn--ghost"
                          type="button"
                          title="Eliminar"
                          onClick={(event) => handleEliminar(mensaje, event)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <span className="mensaje-item__asunto">{mensaje.asunto || '(sin asunto)'}</span>
                      {expandedId === mensaje.id ? (
                        <p className="mensaje-item__cuerpo">{mensaje.cuerpo}</p>
                      ) : (
                        <p className="mensaje-item__preview">{mensaje.cuerpo}</p>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </div>,
          document.body
        )
        : null}

      {composerOpen
        ? createPortal(
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setComposerOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__header">
              <div>
                <div className="section-badge">
                  <PenSquare size={14} />
                  Nuevo mensaje
                </div>
                <h3>Escribir a un compañero</h3>
              </div>
              <button className="icon-btn icon-btn--ghost" type="button" onClick={() => setComposerOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form className="create-form modal-panel__body" onSubmit={handleEnviar}>
              <div className="form-section">
                <label className="field field--required">
                  <span className="field__label">Para <span className="field__required">*</span></span>
                  <select value={destinatarioId} onChange={(event) => setDestinatarioId(event.target.value)}>
                    <option value="">Selecciona un destinatario</option>
                    {contactos.map((contacto) => (
                      <option key={contacto.id} value={contacto.id}>
                        {contacto.nombre} · {contacto.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">Asunto</span>
                  <input value={asunto} onChange={(event) => setAsunto(event.target.value)} placeholder="Ej: Revisar checklist antes del cierre" />
                </label>

                <label className="field field--required">
                  <span className="field__label">Mensaje <span className="field__required">*</span></span>
                  <textarea rows={6} value={cuerpo} onChange={(event) => setCuerpo(event.target.value)} placeholder="Escribe tu mensaje..." />
                </label>
              </div>
            </form>

            <div className="modal-panel__footer">
              <button className="btn btn--ghost" type="button" onClick={() => setComposerOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={handleEnviar}
                disabled={enviando || !destinatarioId || !cuerpo.trim()}
              >
                {enviando ? <Loader2 size={16} className="spin" /> : 'Enviar'}
              </button>
            </div>
          </div>
          </div>,
          document.body
        )
        : null}
    </>
  );
};

export default MensajesPanel;
