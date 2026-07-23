import io
import json
import mimetypes
import os
import uuid
import zipfile
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.documento_controller import DocumentoController
from src.controllers.documento_tree_delete import collect_folder_and_descendants
from src.models.documento import Documento
from src.models.licitacion import Licitacion
from src.models.user import User
from src.schemas.documento import (
    CarpetaCreate,
    CarpetaResponse,
    CarpetaUpdate,
    DocumentoCreate,
    DocumentoPorVencer,
    DocumentoResponse,
    DocumentoUpdate,
    MessageResponse,
)
from src.services.licitacion_explorer_service import analyze_file_bytes, buscar_posicion_en_pdf
from src.utils.file_handlers import FileHandler
from src.utils.permissions import has_permission

router = APIRouter(prefix="/api/documentos", tags=["documentos"])

ADMIN_ROLES = {"super_admin", "admin_empresa"}


def _is_admin(current_user: User) -> bool:
    return bool(set(getattr(current_user, "roles", []) or []).intersection(ADMIN_ROLES))


def _extract_empresa_id(item):
    if item is None:
        return None

    if isinstance(item, dict):
        if item.get("id"):
            return item.get("id")
        empresa = item.get("empresa")
        if isinstance(empresa, dict):
            return empresa.get("id")

    empresa = getattr(item, "empresa", None)
    if empresa is not None:
        empresa_id = getattr(empresa, "id", None)
        if empresa_id:
            return empresa_id

    return getattr(item, "id", None)


def _has_empresa_access(current_user: User, empresa_id: uuid.UUID) -> bool:
    if _is_admin(current_user):
        return True
    return any(str(_extract_empresa_id(item)) == str(empresa_id) for item in (getattr(current_user, "empresas", []) or []))


def _require_document_access(current_user: User, empresa_id: uuid.UUID) -> None:
    if not _has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )


@router.post("/carpetas", response_model=CarpetaResponse, status_code=status.HTTP_201_CREATED)
def create_carpeta(
    carpeta_data: CarpetaCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crear una nueva carpeta."""
    _require_document_access(current_user, carpeta_data.empresa_id)
    return DocumentoController.create_carpeta(carpeta_data, db)


@router.get("/carpetas", response_model=List[CarpetaResponse])
def get_carpetas(
    empresa_id: uuid.UUID,
    carpeta_padre_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener carpetas de una empresa (raiz o dentro de una carpeta)."""
    _require_document_access(current_user, empresa_id)
    return DocumentoController.get_carpetas(empresa_id, carpeta_padre_id, db)


@router.put("/carpetas/{carpeta_id}", response_model=CarpetaResponse)
def update_carpeta(
    carpeta_id: uuid.UUID,
    carpeta_data: CarpetaUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualizar una carpeta."""
    from src.models.documento import Carpeta as CarpetaModel

    carpeta_row = db.query(CarpetaModel).filter(CarpetaModel.id == carpeta_id).first()
    if not carpeta_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Carpeta no encontrada",
        )

    _require_document_access(current_user, carpeta_row.empresa_id)

    update_data = carpeta_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(carpeta_row, key, value)

    db.commit()
    db.refresh(carpeta_row)
    return carpeta_row



@router.post("/upload", response_model=DocumentoResponse, status_code=status.HTTP_201_CREATED)
async def upload_documento(
    empresa_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    nombre: Optional[str] = Form(None),
    carpeta_id: Optional[uuid.UUID] = Form(None),
    tipo_documento: Optional[str] = Form(None),
    descripcion: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    fecha_vencimiento: Optional[datetime] = Form(None),
    meta_data: Optional[str] = Form(None),
    licitacion_id: Optional[uuid.UUID] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Subir un archivo real y guardar su analisis OCR/UNSPSC en meta_data."""
    _require_document_access(current_user, empresa_id)

    licitacion = None
    if licitacion_id:
        licitacion = db.query(Licitacion).filter(Licitacion.id == licitacion_id).first()
        if licitacion and not carpeta_id:
            carpeta = DocumentoController.get_or_create_carpeta_licitacion(
                licitacion_id, empresa_id, licitacion.numero_secop, db
            )
            carpeta_id = carpeta.id

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo esta vacio",
        )

    analysis = await run_in_threadpool(analyze_file_bytes, file_bytes, file.filename or "", None)

    # El checklist marca la carga del RUP con tags="rup". Al guardar aqui el texto OCR
    # completo en la licitacion, la comparacion de indicadores financieros (capacidad
    # financiera) puede leerlo sin que el usuario tenga que volver a subirlo desde el
    # panel de IA.
    if licitacion is not None and tags == "rup" and analysis.get("texto_completo"):
        licitacion.rup_texto = analysis["texto_completo"]

    merged_meta: dict = {}
    if meta_data:
        try:
            parsed = json.loads(meta_data)
            if isinstance(parsed, dict):
                merged_meta.update(parsed)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="meta_data debe ser un JSON valido",
            )

    merged_meta.update(
        {
            "origen": "upload_documento",
            "licitacion_id": str(licitacion_id) if licitacion_id else None,
            "ocr_usado": analysis["archivo"]["used_ocr"],
            "ocr_paginas": analysis["archivo"]["ocr_pages"],
            "paginas": analysis["archivo"]["page_count"],
            "texto_length": analysis["archivo"]["text_length"],
            "texto_preview": analysis["texto_preview"],
            "experiencias_detectadas": len(analysis["experiencias"]),
            "codigos_detectados": [item["codigo"] for item in analysis["codigos_extraidos"][:20]],
            "resumen_ocr": analysis["resumen"],
        }
    )

    saved_file = FileHandler().save_bytes(
        file_bytes,
        file.filename or "documento.pdf",
        subfolder=f"documentos/{empresa_id}",
    )

    documento_data = DocumentoCreate(
        carpeta_id=carpeta_id,
        empresa_id=empresa_id,
        nombre=nombre or (file.filename or "documento").rsplit(".", 1)[0],
        nombre_original=file.filename or nombre,
        tipo_documento=tipo_documento,
        descripcion=descripcion,
        ruta_archivo=saved_file["filepath"],
        tamanio_bytes=saved_file["size"],
        formato=(saved_file["extension"] or "").lstrip(".") or None,
        version="1.0",
        vigente=True,
        fecha_vencimiento=fecha_vencimiento,
        tags=tags,
        meta_data=merged_meta,
        usuario_subida=current_user.id,
    )

    return DocumentoController.create_documento(documento_data, current_user.id, db)


@router.get("/", response_model=List[DocumentoResponse])
def get_documentos(
    empresa_id: uuid.UUID,
    carpeta_id: Optional[uuid.UUID] = None,
    tipo_documento: Optional[str] = None,
    vigente: Optional[bool] = True,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener documentos de una empresa (filtrado por carpeta y tipo)."""
    _require_document_access(current_user, empresa_id)
    return DocumentoController.get_documentos(
        empresa_id, carpeta_id, tipo_documento, vigente, skip, limit, db
    )


@router.get("/por-vencer", response_model=List[DocumentoPorVencer])
def get_documentos_por_vencer(
    empresa_id: Optional[uuid.UUID] = None,
    dias: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener documentos que estan por vencer (proximos X dias)."""
    if empresa_id:
        _require_document_access(current_user, empresa_id)
    elif not _is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes seleccionar una empresa",
        )

    return DocumentoController.get_documentos_por_vencer(empresa_id, dias, db)


def _parse_uuid_csv(raw: Optional[str]) -> List[uuid.UUID]:
    """Convierte 'a,b,c' en una lista de UUID, ignorando valores vacios o invalidos."""
    if not raw:
        return []

    result = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            result.append(uuid.UUID(token))
        except ValueError:
            continue
    return result


@router.get("/zip")
def download_documentos_zip(
    empresa_id: uuid.UUID,
    carpeta_id: Optional[uuid.UUID] = None,
    documento_ids: Optional[str] = None,
    carpeta_ids: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Descarga en un .zip una seleccion puntual de documentos/carpetas, una carpeta
    (con sus subcarpetas) o toda la biblioteca de la empresa cuando no se indica nada."""
    _require_document_access(current_user, empresa_id)

    selected_documento_ids = _parse_uuid_csv(documento_ids)
    selected_carpeta_ids = _parse_uuid_csv(carpeta_ids)

    if selected_documento_ids or selected_carpeta_ids:
        expanded_carpeta_ids: set = set()
        for cid in selected_carpeta_ids:
            expanded_carpeta_ids |= collect_folder_and_descendants(db, empresa_id, cid)

        conditions = []
        if selected_documento_ids:
            conditions.append(Documento.id.in_(selected_documento_ids))
        if expanded_carpeta_ids:
            conditions.append(Documento.carpeta_id.in_(expanded_carpeta_ids))

        query = db.query(Documento).filter(Documento.empresa_id == empresa_id, or_(*conditions))
    else:
        query = db.query(Documento).filter(Documento.empresa_id == empresa_id)
        if carpeta_id:
            carpeta_tree_ids = collect_folder_and_descendants(db, empresa_id, carpeta_id)
            query = query.filter(Documento.carpeta_id.in_(carpeta_tree_ids))

    documentos = query.order_by(Documento.nombre.asc()).all()

    buffer = io.BytesIO()
    used_names: dict = {}
    archivos_agregados = 0
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for documento in documentos:
            if not documento.ruta_archivo or not os.path.exists(documento.ruta_archivo):
                continue

            nombre_descarga = os.path.basename(
                documento.nombre_original or f"{documento.nombre}.{documento.formato or 'bin'}"
            )
            usos = used_names.get(nombre_descarga, 0)
            used_names[nombre_descarga] = usos + 1
            if usos:
                base, ext = os.path.splitext(nombre_descarga)
                nombre_descarga = f"{base} ({usos}){ext}"

            zip_file.write(documento.ruta_archivo, arcname=nombre_descarga)
            archivos_agregados += 1

    if archivos_agregados == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay documentos disponibles para descargar",
        )

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="biblioteca.zip"'},
    )


@router.get("/{documento_id}", response_model=DocumentoResponse)
def get_documento(
    documento_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener un documento por su ID."""
    documento = db.query(Documento).filter(Documento.id == documento_id).first()
    if not documento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado",
        )

    _require_document_access(current_user, documento.empresa_id)
    return DocumentoController.get_documento(documento_id, db)


@router.get("/{documento_id}/archivo")
def get_documento_archivo(
    documento_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Descargar/previsualizar el archivo real de un documento (con control de acceso)."""
    documento = db.query(Documento).filter(Documento.id == documento_id).first()
    if not documento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado",
        )

    _require_document_access(current_user, documento.empresa_id)

    if not documento.ruta_archivo or not os.path.exists(documento.ruta_archivo):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo ya no esta disponible en el servidor",
        )

    media_type, _ = mimetypes.guess_type(documento.ruta_archivo)
    nombre_descarga = documento.nombre_original or f"{documento.nombre}.{documento.formato or 'bin'}"

    return FileResponse(
        documento.ruta_archivo,
        media_type=media_type or "application/octet-stream",
        filename=nombre_descarga,
        content_disposition_type="inline",
    )


@router.get("/{documento_id}/buscar-pagina")
def buscar_pagina_documento(
    documento_id: uuid.UUID,
    q: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Busca en que pagina del PDF real aparece un fragmento de texto y en que rectangulos
    exactos, para saltar ahi y subrayarlo en el visor en vez de mostrar la transcripcion
    OCR (que puede haberse comido letras) o dejar que el usuario lo busque a ojo."""
    documento = db.query(Documento).filter(Documento.id == documento_id).first()
    if not documento:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    _require_document_access(current_user, documento.empresa_id)

    if not documento.ruta_archivo or not os.path.exists(documento.ruta_archivo):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El archivo ya no esta disponible en el servidor")

    with open(documento.ruta_archivo, "rb") as archivo:
        file_bytes = archivo.read()

    resultado = buscar_posicion_en_pdf(file_bytes, q)
    if not resultado:
        return {"pagina": None, "rects": [], "page_width": None, "page_height": None}
    return resultado


@router.put("/{documento_id}", response_model=DocumentoResponse)
def update_documento(
    documento_id: uuid.UUID,
    documento_data: DocumentoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualizar un documento existente."""
    documento = db.query(Documento).filter(Documento.id == documento_id).first()
    if not documento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado",
        )

    _require_document_access(current_user, documento.empresa_id)
    return DocumentoController.update_documento(documento_id, documento_data, db)


@router.delete("/{documento_id}", response_model=MessageResponse)
def delete_documento(
    documento_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Eliminar un documento (borrado real)."""


    documento = db.query(Documento).filter(Documento.id == documento_id).first()
    if not documento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado",
        )

    _require_document_access(current_user, documento.empresa_id)

    if not (_is_admin(current_user) or has_permission(current_user, "documentos.eliminar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para eliminar documentos",
        )

    return DocumentoController.delete_documento(documento_id, db)


@router.delete("/carpetas/{carpeta_id}", response_model=MessageResponse)
def delete_carpeta(
    carpeta_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hard delete recursivo de una carpeta (incluye subcarpetas y documentos)."""
    # Nota: validación real se hace dentro del helper (carpeta_tree_delete).

    # Para obtener empresa_id, buscamos la carpeta.
    from src.models.documento import Carpeta as CarpetaModel

    carpeta_row = db.query(CarpetaModel).filter(CarpetaModel.id == carpeta_id).first()
    if not carpeta_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Carpeta no encontrada",
        )

    _require_document_access(current_user, carpeta_row.empresa_id)
    DocumentoController.delete_carpeta_recursive(
        carpeta_id=carpeta_id,
        empresa_id=carpeta_row.empresa_id,
        db=db,
    )

    return {"message": "Carpeta eliminada correctamente"}

