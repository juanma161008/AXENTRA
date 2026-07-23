"""Notificaciones automaticas por eventos del sistema (se agrego una oportunidad, se
valido un item del checklist, etc.), reutilizando la mensajeria interna ya existente
(seguridad.mensajes) en vez de un canal aparte -- cada evento le manda un mensaje normal,
de parte de quien lo disparo, a todos los que tengan acceso a esa empresa."""
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from src.models.mensaje import Mensaje
from src.models.user import User
from src.models.usuario_empresa import UsuarioEmpresa


def _destinatarios_de_empresa(empresa_id: UUID, db: Session, excluir_usuario_id=None) -> set:
    ids = {
        row.usuario_id
        for row in db.query(UsuarioEmpresa.usuario_id).filter(UsuarioEmpresa.empresa_id == empresa_id).distinct().all()
    }
    ids.discard(excluir_usuario_id)
    return ids


def _todos_los_usuarios_activos(db: Session, excluir_usuario_id=None) -> set:
    ids = {row.id for row in db.query(User.id).filter(User.activo.is_(True)).all()}
    ids.discard(excluir_usuario_id)
    return ids


def notificar_por_empresa(
    db: Session,
    empresa_id: Optional[UUID],
    remitente_id,
    asunto: str,
    cuerpo: str,
    tipo: str = "mensaje",
) -> None:
    """Manda el mismo aviso a todos los que tienen acceso a esa empresa (o a todos los
    usuarios activos si el evento no esta atado a una empresa concreta), sin incluir a
    quien disparo el evento. `tipo` deja marcado el mensaje como aviso automatico (para
    poder resaltarlo distinto en la bandeja, sobre todo las alertas criticas). remitente_id
    puede ser None para avisos que dispara el propio sistema (alertas), no un usuario."""
    if empresa_id:
        destinatarios = _destinatarios_de_empresa(empresa_id, db, excluir_usuario_id=remitente_id)
    else:
        destinatarios = _todos_los_usuarios_activos(db, excluir_usuario_id=remitente_id)

    if not destinatarios:
        return

    for destinatario_id in destinatarios:
        db.add(
            Mensaje(
                remitente_id=remitente_id,
                destinatario_id=destinatario_id,
                asunto=asunto,
                cuerpo=cuerpo,
                tipo=tipo,
                leido=False,
            )
        )
    db.commit()
