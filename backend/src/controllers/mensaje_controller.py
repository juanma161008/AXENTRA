from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.models.mensaje import Mensaje
from src.models.user import User
from src.models.usuario_empresa import UsuarioEmpresa
from src.schemas.mensaje import MensajeCreate

CARPETAS_VALIDAS = {"recibidos", "enviados"}


class MensajeController:
    @staticmethod
    def _nombre_usuario(user_id, db: Session) -> Optional[str]:
        if not user_id:
            return None
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        return f"{user.nombre} {user.apellido}".strip()

    @staticmethod
    def _to_response(mensaje: Mensaje, db: Session) -> dict:
        return {
            "id": mensaje.id,
            "remitente_id": mensaje.remitente_id,
            "remitente_nombre": MensajeController._nombre_usuario(mensaje.remitente_id, db) or "Sistema",
            "destinatario_id": mensaje.destinatario_id,
            "destinatario_nombre": MensajeController._nombre_usuario(mensaje.destinatario_id, db),
            "asunto": mensaje.asunto,
            "cuerpo": mensaje.cuerpo,
            "tipo": mensaje.tipo or "mensaje",
            "leido": mensaje.leido,
            "created_at": mensaje.created_at,
        }

    @staticmethod
    def listar_contactos(usuario_id, is_admin: bool, db: Session) -> List[dict]:
        """A quien le puede escribir este usuario: un admin le puede escribir a cualquiera;
        el resto solo a compañeros con los que comparte al menos una empresa (limite del
        multi-tenant que ya respeta el resto de la app)."""
        if is_admin:
            usuarios = db.query(User).filter(User.id != usuario_id, User.activo.is_(True)).order_by(User.nombre).all()
        else:
            empresa_ids = [
                row.empresa_id
                for row in db.query(UsuarioEmpresa.empresa_id).filter(UsuarioEmpresa.usuario_id == usuario_id).all()
            ]
            if not empresa_ids:
                return []
            colega_ids = (
                db.query(UsuarioEmpresa.usuario_id)
                .filter(UsuarioEmpresa.empresa_id.in_(empresa_ids), UsuarioEmpresa.usuario_id != usuario_id)
                .distinct()
                .all()
            )
            ids = [row.usuario_id for row in colega_ids]
            if not ids:
                return []
            usuarios = db.query(User).filter(User.id.in_(ids), User.activo.is_(True)).order_by(User.nombre).all()

        return [{"id": u.id, "nombre": f"{u.nombre} {u.apellido}".strip(), "email": u.email} for u in usuarios]

    @staticmethod
    def enviar_mensaje(data: MensajeCreate, remitente_id, is_admin: bool, db: Session) -> dict:
        if str(data.destinatario_id) == str(remitente_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes enviarte un mensaje a ti mismo")

        destinatario = db.query(User).filter(User.id == data.destinatario_id).first()
        if not destinatario:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destinatario no encontrado")

        if not is_admin:
            contactos_validos = {c["id"] for c in MensajeController.listar_contactos(remitente_id, False, db)}
            if data.destinatario_id not in contactos_validos:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo puedes escribirle a compañeros de tu misma empresa",
                )

        mensaje = Mensaje(
            remitente_id=remitente_id,
            destinatario_id=data.destinatario_id,
            asunto=(data.asunto or "").strip() or None,
            cuerpo=data.cuerpo.strip(),
        )
        db.add(mensaje)
        db.commit()
        db.refresh(mensaje)
        return MensajeController._to_response(mensaje, db)

    @staticmethod
    def listar_mensajes(usuario_id, carpeta: str, db: Session) -> List[dict]:
        if carpeta not in CARPETAS_VALIDAS:
            carpeta = "recibidos"

        query = db.query(Mensaje)
        if carpeta == "recibidos":
            query = query.filter(Mensaje.destinatario_id == usuario_id)
        else:
            query = query.filter(Mensaje.remitente_id == usuario_id)

        mensajes = query.order_by(Mensaje.created_at.desc()).all()
        return [MensajeController._to_response(m, db) for m in mensajes]

    @staticmethod
    def contar_no_leidos(usuario_id, db: Session) -> int:
        return (
            db.query(Mensaje)
            .filter(Mensaje.destinatario_id == usuario_id, Mensaje.leido.is_(False))
            .count()
        )

    @staticmethod
    def marcar_leido(mensaje_id, usuario_id, db: Session) -> dict:
        mensaje = db.query(Mensaje).filter(Mensaje.id == mensaje_id).first()
        if not mensaje:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensaje no encontrado")
        if str(mensaje.destinatario_id) != str(usuario_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes marcar este mensaje")

        mensaje.leido = True
        db.commit()
        db.refresh(mensaje)
        return MensajeController._to_response(mensaje, db)

    @staticmethod
    def eliminar_mensaje(mensaje_id, usuario_id, db: Session) -> dict:
        mensaje = (
            db.query(Mensaje)
            .filter(Mensaje.id == mensaje_id)
            .filter(or_(Mensaje.remitente_id == usuario_id, Mensaje.destinatario_id == usuario_id))
            .first()
        )
        if not mensaje:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensaje no encontrado")

        db.delete(mensaje)
        db.commit()
        return {"message": "Mensaje eliminado"}
