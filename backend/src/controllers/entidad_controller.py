import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.models.entidad import Entidad
from src.schemas.entidad import EntidadCreate, EntidadUpdate
from src.utils.constants import MENSAJES


class EntidadController:
    @staticmethod
    def get_entidades(db: Session, skip: int = 0, limit: int = 100, activo: Optional[bool] = None, q: Optional[str] = None):
        query = db.query(Entidad)
        if activo is not None:
            query = query.filter(Entidad.activo == activo)
        if q:
            like = f"%{q}%"
            query = query.filter((Entidad.nombre.ilike(like)) | (Entidad.nit.ilike(like)))
        return query.order_by(Entidad.nombre.asc()).offset(skip).limit(limit).all()

    @staticmethod
    def get_entidad(entidad_id: uuid.UUID, db: Session) -> Entidad:
        entidad = db.query(Entidad).filter(Entidad.id == entidad_id).first()
        if not entidad:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entidad no encontrada")
        return entidad

    @staticmethod
    def buscar_por_nit(nit: str, db: Session) -> Optional[Entidad]:
        if not nit:
            return None
        return db.query(Entidad).filter(Entidad.nit == nit).first()

    @staticmethod
    def get_or_create_by_nit(nit: Optional[str], nombre: Optional[str], db: Session) -> Optional[Entidad]:
        """Reutiliza la entidad si el NIT ya existe; si no, la crea a partir de los datos de la licitacion."""
        if not nit or not nombre:
            return None

        existente = EntidadController.buscar_por_nit(nit, db)
        if existente:
            return existente

        nueva = Entidad(id=uuid.uuid4(), nombre=nombre, nit=nit)
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
        return nueva

    @staticmethod
    def create_entidad(data: EntidadCreate, db: Session) -> Entidad:
        existing = db.query(Entidad).filter(Entidad.nit == data.nit).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El NIT ya esta registrado")

        nueva = Entidad(id=uuid.uuid4(), **data.model_dump(), activo=True)
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
        return nueva

    @staticmethod
    def update_entidad(entidad_id: uuid.UUID, data: EntidadUpdate, db: Session) -> Entidad:
        entidad = EntidadController.get_entidad(entidad_id, db)

        if data.nit and data.nit != entidad.nit:
            existing = db.query(Entidad).filter(Entidad.nit == data.nit).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El NIT ya esta registrado por otra entidad")

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(entidad, key, value)

        db.commit()
        db.refresh(entidad)
        return entidad

    @staticmethod
    def delete_entidad(entidad_id: uuid.UUID, db: Session):
        entidad = EntidadController.get_entidad(entidad_id, db)
        entidad.activo = False
        db.commit()
        return {"message": MENSAJES.get("ENTIDAD_ELIMINADA", "Entidad desactivada correctamente")}
