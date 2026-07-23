import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from src.models.licitacion import ChecklistEstado
from src.models.user import User


class ChecklistEstadoController:
    """Estado manual del checklist: quien marco cada item como cumplido y cuando,
    y las banderas de subsanacion. Documento adjunto es siempre opcional."""

    @staticmethod
    def get_estados_map(licitacion_id: uuid.UUID, db: Session) -> Dict[str, ChecklistEstado]:
        estados = (
            db.query(ChecklistEstado)
            .filter(ChecklistEstado.licitacion_id == licitacion_id)
            .all()
        )
        return {estado.item_key: estado for estado in estados}

    @staticmethod
    def _get_or_create(licitacion_id: uuid.UUID, item_key: str, db: Session) -> ChecklistEstado:
        estado = (
            db.query(ChecklistEstado)
            .filter(
                ChecklistEstado.licitacion_id == licitacion_id,
                ChecklistEstado.item_key == item_key,
            )
            .first()
        )
        if not estado:
            estado = ChecklistEstado(
                id=uuid.uuid4(),
                licitacion_id=licitacion_id,
                item_key=item_key,
            )
            db.add(estado)
        return estado

    @staticmethod
    def update_item(
        licitacion_id: uuid.UUID,
        item_key: str,
        cumplido: bool,
        documento_id: Optional[uuid.UUID],
        usuario_id: Optional[uuid.UUID],
        db: Session,
    ) -> ChecklistEstado:
        estado = ChecklistEstadoController._get_or_create(licitacion_id, item_key, db)
        estado.cumplido = cumplido
        if documento_id is not None:
            estado.documento_id = documento_id
        estado.validado_por = usuario_id
        estado.validado_en = datetime.now(timezone.utc)

        if cumplido:
            estado.requiere_subsanacion = False
            estado.notas_subsanacion = None

        db.commit()
        db.refresh(estado)
        return estado

    @staticmethod
    def marcar_subsanacion(
        licitacion_id: uuid.UUID,
        item_key: str,
        notas: Optional[str],
        db: Session,
    ) -> ChecklistEstado:
        estado = ChecklistEstadoController._get_or_create(licitacion_id, item_key, db)
        estado.requiere_subsanacion = True
        estado.notas_subsanacion = notas
        db.commit()
        db.refresh(estado)
        return estado

    @staticmethod
    def resolver_subsanacion(
        licitacion_id: uuid.UUID,
        item_key: str,
        db: Session,
    ) -> Optional[ChecklistEstado]:
        estado = (
            db.query(ChecklistEstado)
            .filter(
                ChecklistEstado.licitacion_id == licitacion_id,
                ChecklistEstado.item_key == item_key,
            )
            .first()
        )
        if not estado:
            return None

        estado.requiere_subsanacion = False
        estado.notas_subsanacion = None
        db.commit()
        db.refresh(estado)
        return estado

    @staticmethod
    def licitacion_tiene_subsanaciones_activas(licitacion_id: uuid.UUID, db: Session) -> bool:
        return (
            db.query(ChecklistEstado)
            .filter(
                ChecklistEstado.licitacion_id == licitacion_id,
                ChecklistEstado.requiere_subsanacion == True,  # noqa: E712
            )
            .first()
            is not None
        )

    @staticmethod
    def licitaciones_con_subsanaciones_activas(licitacion_ids: List[uuid.UUID], db: Session) -> set:
        if not licitacion_ids:
            return set()

        rows = (
            db.query(ChecklistEstado.licitacion_id)
            .filter(
                ChecklistEstado.licitacion_id.in_(licitacion_ids),
                ChecklistEstado.requiere_subsanacion == True,  # noqa: E712
            )
            .distinct()
            .all()
        )
        return {row[0] for row in rows}

    @staticmethod
    def nombres_usuarios(usuario_ids, db: Session) -> Dict[uuid.UUID, str]:
        ids = {uid for uid in usuario_ids if uid}
        if not ids:
            return {}

        resultado = {}
        for user in db.query(User).filter(User.id.in_(ids)).all():
            nombre_completo = " ".join(filter(None, [user.nombre, user.apellido])).strip()
            resultado[user.id] = nombre_completo or user.email
        return resultado

    @staticmethod
    def listar_actividad(licitacion_id: uuid.UUID, db: Session, limit: int = 15) -> List[dict]:
        estados = (
            db.query(ChecklistEstado)
            .filter(
                ChecklistEstado.licitacion_id == licitacion_id,
                ChecklistEstado.validado_en.isnot(None),
            )
            .order_by(ChecklistEstado.validado_en.desc())
            .limit(limit)
            .all()
        )

        usuarios = ChecklistEstadoController.nombres_usuarios(
            (estado.validado_por for estado in estados), db
        )

        return [
            {
                "item_key": estado.item_key,
                "cumplido": estado.cumplido,
                "validado_por": estado.validado_por,
                "validado_por_nombre": usuarios.get(estado.validado_por),
                "validado_en": estado.validado_en,
            }
            for estado in estados
        ]
