import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.models.documento import Documento
from src.models.licitacion import RequisitoChecklist
from src.schemas.licitacion import RequisitoCreate, RequisitoUpdate
from src.services.licitacion_explorer_service import analyze_file_bytes, buscar_coincidencias


class RequisitoController:
    @staticmethod
    def _with_documento_nombre(requisito: RequisitoChecklist, db: Session) -> dict:
        documento_nombre = None
        if requisito.documento_id:
            documento = db.query(Documento).filter(Documento.id == requisito.documento_id).first()
            documento_nombre = documento.nombre if documento else None

        return {**requisito.__dict__, "documento_nombre": documento_nombre}

    @staticmethod
    def list_requisitos(licitacion_id: uuid.UUID, db: Session):
        requisitos = (
            db.query(RequisitoChecklist)
            .filter(RequisitoChecklist.licitacion_id == licitacion_id)
            .order_by(RequisitoChecklist.orden, RequisitoChecklist.created_at)
            .all()
        )
        return [RequisitoController._with_documento_nombre(r, db) for r in requisitos]

    @staticmethod
    def create_requisito(licitacion_id: uuid.UUID, data: RequisitoCreate, db: Session):
        nuevo = RequisitoChecklist(
            id=uuid.uuid4(),
            **data.model_dump(exclude={"licitacion_id"}),
            licitacion_id=licitacion_id,
        )
        db.add(nuevo)
        db.commit()
        db.refresh(nuevo)
        return RequisitoController._with_documento_nombre(nuevo, db)

    @staticmethod
    def update_requisito(requisito_id: uuid.UUID, data: RequisitoUpdate, db: Session):
        requisito = db.query(RequisitoChecklist).filter(RequisitoChecklist.id == requisito_id).first()
        if not requisito:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisito no encontrado")

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(requisito, key, value)

        db.commit()
        db.refresh(requisito)
        return RequisitoController._with_documento_nombre(requisito, db)

    @staticmethod
    def delete_requisito(requisito_id: uuid.UUID, db: Session):
        requisito = db.query(RequisitoChecklist).filter(RequisitoChecklist.id == requisito_id).first()
        if not requisito:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisito no encontrado")

        db.delete(requisito)
        db.commit()
        return {"message": "Requisito eliminado correctamente"}

    @staticmethod
    def evaluar_requisitos(licitacion_id: uuid.UUID, documento_id: uuid.UUID, db: Session):
        documento = db.query(Documento).filter(Documento.id == documento_id).first()
        if not documento:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

        try:
            with open(documento.ruta_archivo, "rb") as f:
                file_bytes = f.read()
        except OSError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fue posible leer el archivo del documento",
            )

        analysis = analyze_file_bytes(file_bytes, documento.nombre_original or documento.nombre)
        experiencias = analysis["experiencias"]

        requisitos = (
            db.query(RequisitoChecklist)
            .filter(
                RequisitoChecklist.licitacion_id == licitacion_id,
                RequisitoChecklist.tipo == "especifico",
            )
            .all()
        )

        for requisito in requisitos:
            codigo = (requisito.requisito_especifico or {}).get("codigo") if requisito.requisito_especifico else None
            coincidencias = buscar_coincidencias(experiencias, [codigo]) if codigo else []

            requisito.documento_id = documento.id
            if coincidencias:
                mejor = coincidencias[0]
                requisito.estado = "cumple"
                requisito.cumple_validacion = True
                requisito.valor_calculado = (
                    f"Experiencia #{mejor['experiencia_no']}"
                    + (f" - {mejor['contratante']}" if mejor.get("contratante") else "")
                )[:200]
            else:
                requisito.estado = "no_cumple"
                requisito.cumple_validacion = False
                requisito.valor_calculado = None

        db.commit()

        requisitos_actualizados = RequisitoController.list_requisitos(licitacion_id, db)

        return {
            "requisitos": requisitos_actualizados,
            "analisis": {
                "experiencias": experiencias,
                "coincidencias": analysis["coincidencias"],
                "resumen": analysis["resumen"],
            },
        }
