from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import nullslast, or_
from sqlalchemy.orm import Session

from src.models.empresa import Empresa
from src.models.licitacion import Licitacion
from src.models.oportunidad import Oportunidad
from src.models.user import User
from src.schemas.oportunidad import OportunidadCreate, OportunidadUpdate
from src.services.notificacion_service import notificar_por_empresa

ESTADOS_VALIDOS = {"pendiente", "revisada", "convertida", "descartada"}


class OportunidadController:
    @staticmethod
    def _nombre_usuario(user_id, db: Session) -> Optional[str]:
        if not user_id:
            return None
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        return f"{user.nombre} {user.apellido}".strip()

    @staticmethod
    def _nombre_empresa(empresa_id, db: Session) -> Optional[str]:
        if not empresa_id:
            return None
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        return empresa.nombre if empresa else None

    @staticmethod
    def _to_response(oportunidad: Oportunidad, db: Session) -> dict:
        licitacion = None
        if oportunidad.licitacion_id:
            licitacion = db.query(Licitacion).filter(Licitacion.id == oportunidad.licitacion_id).first()

        return {
            "id": oportunidad.id,
            "empresa_id": oportunidad.empresa_id,
            "empresa_nombre": OportunidadController._nombre_empresa(oportunidad.empresa_id, db),
            "empresa_asignada_por": oportunidad.empresa_asignada_por,
            "empresa_asignada_por_nombre": OportunidadController._nombre_usuario(oportunidad.empresa_asignada_por, db),
            "empresa_asignada_en": oportunidad.empresa_asignada_en,
            "url_secop": oportunidad.url_secop,
            "comentario": oportunidad.comentario,
            "fecha_presentacion": oportunidad.fecha_presentacion,
            "estado": oportunidad.estado,
            "licitacion_id": oportunidad.licitacion_id,
            "licitacion_numero_secop": licitacion.numero_secop if licitacion else None,
            "licitacion_estado": licitacion.estado if licitacion else None,
            "creado_por": oportunidad.creado_por,
            "creado_por_nombre": OportunidadController._nombre_usuario(oportunidad.creado_por, db),
            "revisado_por": oportunidad.revisado_por,
            "revisado_por_nombre": OportunidadController._nombre_usuario(oportunidad.revisado_por, db),
            "revisado_en": oportunidad.revisado_en,
            "created_at": oportunidad.created_at,
            "updated_at": oportunidad.updated_at,
        }

    @staticmethod
    def create_oportunidad(data: OportunidadCreate, usuario_id, db: Session) -> dict:
        oportunidad = Oportunidad(
            empresa_id=data.empresa_id,
            url_secop=data.url_secop.strip(),
            comentario=(data.comentario or "").strip() or None,
            fecha_presentacion=data.fecha_presentacion,
            creado_por=usuario_id,
        )
        db.add(oportunidad)
        db.commit()
        db.refresh(oportunidad)

        remitente_nombre = OportunidadController._nombre_usuario(usuario_id, db) or "Alguien del equipo"
        notificar_por_empresa(
            db,
            oportunidad.empresa_id,
            usuario_id,
            "Nueva oportunidad SECOP",
            f"{remitente_nombre} agregó una oportunidad: {oportunidad.url_secop}"
            + (f"\n\n{oportunidad.comentario}" if oportunidad.comentario else ""),
            tipo="oportunidad",
        )

        return OportunidadController._to_response(oportunidad, db)

    @staticmethod
    def list_oportunidades(
        db: Session,
        empresa_id=None,
        empresa_ids: Optional[List] = None,
        estado: Optional[str] = None,
    ) -> List[dict]:
        query = db.query(Oportunidad)

        # Las que todavia no tienen empresa asignada quedan visibles para todos (son avisos
        # generales hasta que alguien decida a que empresa aplican), asi que se suman al
        # scope normal en vez de reemplazarlo.
        if empresa_id:
            query = query.filter(or_(Oportunidad.empresa_id == empresa_id, Oportunidad.empresa_id.is_(None)))
        elif empresa_ids is not None:
            if not empresa_ids:
                query = query.filter(Oportunidad.empresa_id.is_(None))
            else:
                query = query.filter(or_(Oportunidad.empresa_id.in_(empresa_ids), Oportunidad.empresa_id.is_(None)))

        if estado:
            query = query.filter(Oportunidad.estado == estado)

        # Primero la que cierra mas pronto (asi no se pasa por alto la mas urgente), y las
        # que no tienen fecha al final, ordenadas por mas reciente.
        query = query.order_by(nullslast(Oportunidad.fecha_presentacion.asc()), Oportunidad.created_at.desc())
        return [OportunidadController._to_response(item, db) for item in query.all()]

    @staticmethod
    def update_oportunidad(oportunidad_id, data: OportunidadUpdate, usuario_id, db: Session) -> dict:
        oportunidad = db.query(Oportunidad).filter(Oportunidad.id == oportunidad_id).first()
        if not oportunidad:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Oportunidad no encontrada")

        update_data = data.model_dump(exclude_unset=True)
        if "estado" in update_data and update_data["estado"] not in ESTADOS_VALIDOS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Estado invalido")

        # Si de verdad cambia la empresa (asignacion inicial o reasignacion), se registra
        # quien lo hizo y cuando -- parte del "flujo" visible de la oportunidad, no solo el
        # estado final.
        empresa_cambio = "empresa_id" in update_data and str(update_data["empresa_id"]) != str(oportunidad.empresa_id)

        for key, value in update_data.items():
            setattr(oportunidad, key, value)

        if empresa_cambio:
            oportunidad.empresa_asignada_por = usuario_id
            oportunidad.empresa_asignada_en = datetime.now()

        # Marcar quien y cuando la saco de "pendiente", para que quede claro quien ya la
        # atendio y el resto del equipo no la vuelva a mirar como si nadie la hubiera visto.
        if update_data.get("estado") and update_data["estado"] != "pendiente":
            oportunidad.revisado_por = usuario_id
            oportunidad.revisado_en = datetime.now()

        db.commit()
        db.refresh(oportunidad)
        return OportunidadController._to_response(oportunidad, db)

    @staticmethod
    def delete_oportunidad(oportunidad_id, db: Session) -> dict:
        oportunidad = db.query(Oportunidad).filter(Oportunidad.id == oportunidad_id).first()
        if not oportunidad:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Oportunidad no encontrada")
        db.delete(oportunidad)
        db.commit()
        return {"message": "Oportunidad eliminada"}
