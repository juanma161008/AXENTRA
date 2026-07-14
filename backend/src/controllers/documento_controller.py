from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import List, Optional
import uuid
from datetime import datetime, timedelta

from src.models.documento import Carpeta, Documento, VersionDocumento
from src.models.empresa import Empresa
from src.schemas.documento import CarpetaCreate, DocumentoCreate, DocumentoUpdate
from src.utils.constants import MENSAJES
from src.utils.file_handlers import FileHandler

from src.controllers.documento_tree_delete import delete_folder_tree

class DocumentoController:
    @staticmethod
    def create_carpeta(carpeta_data: CarpetaCreate, db: Session):
        """Crear carpeta"""
        empresa = db.query(Empresa).filter(Empresa.id == carpeta_data.empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada"
            )
        
        data = carpeta_data.model_dump()

        if carpeta_data.carpeta_padre_id:
            padre = db.query(Carpeta).filter(Carpeta.id == carpeta_data.carpeta_padre_id).first()
            if not padre:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Carpeta padre no encontrada"
                )
            if padre.empresa_id != carpeta_data.empresa_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="La carpeta padre no pertenece a la misma empresa"
                )
            # Las subcarpetas heredan la licitacion del padre para que sigan
            # apareciendo dentro del mismo proceso en el explorador.
            if not data.get("licitacion_id"):
                data["licitacion_id"] = padre.licitacion_id

        new_carpeta = Carpeta(
            id=uuid.uuid4(),
            **data
        )
        
        db.add(new_carpeta)
        db.commit()
        db.refresh(new_carpeta)
        
        return new_carpeta

    @staticmethod
    def get_or_create_carpeta_licitacion(
        licitacion_id: uuid.UUID,
        empresa_id: uuid.UUID,
        nombre: str,
        db: Session,
    ) -> Carpeta:
        """Obtiene la carpeta raiz de una licitacion, creandola si todavia no existe."""
        carpeta = db.query(Carpeta).filter(Carpeta.licitacion_id == licitacion_id).first()
        if carpeta:
            return carpeta

        carpeta = Carpeta(
            id=uuid.uuid4(),
            empresa_id=empresa_id,
            licitacion_id=licitacion_id,
            nombre=nombre or f"Proceso {str(licitacion_id)[:8]}",
            descripcion="Carpeta generada automaticamente para esta licitacion",
        )
        db.add(carpeta)
        db.commit()
        db.refresh(carpeta)
        return carpeta

    @staticmethod
    def get_carpetas(empresa_id: uuid.UUID, carpeta_padre_id: Optional[uuid.UUID], db: Session):
        """Obtener carpetas. Trae tambien el numero/entidad de la licitacion (para diferenciar
        carpetas de proceso cuando se navega a nivel de toda la empresa) y cuantos documentos
        tiene cada carpeta."""
        from sqlalchemy import func
        from src.models.licitacion import Licitacion

        query = db.query(Carpeta).filter(Carpeta.empresa_id == empresa_id)

        if carpeta_padre_id:
            query = query.filter(Carpeta.carpeta_padre_id == carpeta_padre_id)
        else:
            query = query.filter(Carpeta.carpeta_padre_id.is_(None))

        carpetas = query.order_by(Carpeta.nombre.asc()).all()

        licitacion_ids = {carpeta.licitacion_id for carpeta in carpetas if carpeta.licitacion_id}
        licitaciones_by_id = {}
        if licitacion_ids:
            licitaciones_by_id = {
                lic.id: lic
                for lic in db.query(Licitacion).filter(Licitacion.id.in_(licitacion_ids)).all()
            }

        carpeta_ids = [carpeta.id for carpeta in carpetas]
        counts_by_carpeta = {}
        if carpeta_ids:
            rows = (
                db.query(Documento.carpeta_id, func.count(Documento.id))
                .filter(Documento.carpeta_id.in_(carpeta_ids))
                .group_by(Documento.carpeta_id)
                .all()
            )
            counts_by_carpeta = dict(rows)

        for carpeta in carpetas:
            licitacion = licitaciones_by_id.get(carpeta.licitacion_id)
            carpeta.licitacion_numero = licitacion.numero_secop if licitacion else None
            carpeta.licitacion_entidad = licitacion.entidad_contratante if licitacion else None
            carpeta.total_documentos = counts_by_carpeta.get(carpeta.id, 0)

        return carpetas

    @staticmethod
    def create_documento(documento_data: DocumentoCreate, usuario_id: uuid.UUID, db: Session):
        """Crear documento"""
        empresa = db.query(Empresa).filter(Empresa.id == documento_data.empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada"
            )
        
        if documento_data.carpeta_id:
            carpeta = db.query(Carpeta).filter(Carpeta.id == documento_data.carpeta_id).first()
            if not carpeta:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Carpeta no encontrada"
                )
            if carpeta.empresa_id != documento_data.empresa_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="La carpeta no pertenece a la misma empresa"
                )
        
        new_documento = Documento(
            id=uuid.uuid4(),
            **documento_data.model_dump(exclude={'usuario_subida'}),
            usuario_subida=usuario_id or documento_data.usuario_subida
        )
        
        db.add(new_documento)
        db.commit()
        db.refresh(new_documento)
        
        carpeta_nombre = None
        if new_documento.carpeta_id:
            carpeta = db.query(Carpeta).filter(Carpeta.id == new_documento.carpeta_id).first()
            carpeta_nombre = carpeta.nombre if carpeta else None
        
        return {
            **new_documento.__dict__,
            "carpeta_nombre": carpeta_nombre
        }

    @staticmethod
    def get_documentos(
        empresa_id: uuid.UUID,
        carpeta_id: Optional[uuid.UUID],
        tipo_documento: Optional[str],
        vigente: Optional[bool],
        skip: int,
        limit: int,
        db: Session
    ):
        """Obtener documentos"""
        query = db.query(Documento).filter(Documento.empresa_id == empresa_id)
        
        if carpeta_id:
            query = query.filter(Documento.carpeta_id == carpeta_id)
        if tipo_documento:
            query = query.filter(Documento.tipo_documento == tipo_documento)
        if vigente is not None:
            query = query.filter(Documento.vigente == vigente)
        
        documentos = query.order_by(Documento.nombre).offset(skip).limit(limit).all()
        
        result = []
        for doc in documentos:
            carpeta_nombre = None
            if doc.carpeta_id:
                carpeta = db.query(Carpeta).filter(Carpeta.id == doc.carpeta_id).first()
                carpeta_nombre = carpeta.nombre if carpeta else None
            result.append({
                **doc.__dict__,
                "carpeta_nombre": carpeta_nombre
            })
        
        return result

    @staticmethod
    def get_documento(documento_id: uuid.UUID, db: Session):
        """Obtener documento por ID"""
        documento = db.query(Documento).filter(Documento.id == documento_id).first()
        if not documento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Documento no encontrado"
            )
        
        carpeta_nombre = None
        if documento.carpeta_id:
            carpeta = db.query(Carpeta).filter(Carpeta.id == documento.carpeta_id).first()
            carpeta_nombre = carpeta.nombre if carpeta else None
        
        return {
            **documento.__dict__,
            "carpeta_nombre": carpeta_nombre
        }

    @staticmethod
    def update_documento(documento_id: uuid.UUID, documento_data: DocumentoUpdate, db: Session):
        """Actualizar documento"""
        documento = db.query(Documento).filter(Documento.id == documento_id).first()
        if not documento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Documento no encontrado"
            )
        
        update_data = documento_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(documento, key, value)
        
        db.commit()
        db.refresh(documento)
        
        carpeta_nombre = None
        if documento.carpeta_id:
            carpeta = db.query(Carpeta).filter(Carpeta.id == documento.carpeta_id).first()
            carpeta_nombre = carpeta.nombre if carpeta else None
        
        return {
            **documento.__dict__,
            "carpeta_nombre": carpeta_nombre
        }

    @staticmethod
    def delete_documento(documento_id: uuid.UUID, db: Session):
        """Eliminar documento (borrado real)"""
        documento = db.query(Documento).filter(Documento.id == documento_id).first()
        if not documento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Documento no encontrado",
            )

        # Elimina el archivo físico si existe
        try:
            if getattr(documento, "ruta_archivo", None):
                FileHandler().delete_file(documento.ruta_archivo)
        except Exception:
            # Si falla borrar el archivo físico, igual eliminamos el registro.
            pass

        db.delete(documento)
        db.commit()

        return {"message": MENSAJES["DOCUMENTO_ELIMINADO"]}

    @staticmethod
    def delete_carpeta_recursive(carpeta_id: uuid.UUID, empresa_id: uuid.UUID, db: Session):
        """Hard delete recursivo de una carpeta (incluye subcarpetas y documentos)."""
        # Validación de pertenencia por empresa (carpeta_tree_delete también verifica).
        return delete_folder_tree(db=db, empresa_id=empresa_id, carpeta_id=carpeta_id)

    @staticmethod
    def get_documentos_por_vencer(empresa_id: Optional[uuid.UUID], dias: int, db: Session):
        """Obtener documentos por vencer. empresa_id=None agrega el resultado de todas las empresas."""
        fecha_limite = datetime.now() + timedelta(days=dias)

        query = db.query(Documento).filter(
            Documento.vigente == True,
            Documento.fecha_vencimiento.isnot(None),
            Documento.fecha_vencimiento <= fecha_limite
        )
        if empresa_id:
            query = query.filter(Documento.empresa_id == empresa_id)

        documentos = query.order_by(Documento.fecha_vencimiento.asc()).all()

        empresa_ids = {doc.empresa_id for doc in documentos if doc.empresa_id}
        empresas_lookup = {}
        if empresa_ids:
            for empresa in db.query(Empresa).filter(Empresa.id.in_(list(empresa_ids))).all():
                empresas_lookup[empresa.id] = empresa.nombre

        result = []
        for doc in documentos:
            dias_restantes = (doc.fecha_vencimiento.date() - datetime.now().date()).days

            if dias_restantes < 0:
                estado = "vencido"
            elif dias_restantes <= 15:
                estado = "por_vencer"
            elif dias_restantes <= 30:
                estado = "proximo"
            else:
                estado = "vigente"

            result.append({
                "id": doc.id,
                "nombre": doc.nombre,
                "tipo_documento": doc.tipo_documento,
                "fecha_vencimiento": doc.fecha_vencimiento,
                "empresa": empresas_lookup.get(doc.empresa_id, "Sin empresa"),
                "dias_restantes": dias_restantes,
                "estado": estado
            })

        return result