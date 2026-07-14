from typing import Any, Dict, List, Optional
import uuid


from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.licitacion_controller import LicitacionController
from src.controllers.requisito_controller import RequisitoController
from src.models.user import User
from src.schemas.licitacion import (
    DashboardResumen,
    LicitacionCreate,
    LicitacionResponse,
    LicitacionUpdate,
    MessageResponse,
    ProximoCierre,
    RequisitoCreate,
    RequisitoResponse,
    RequisitoUpdate,
)
from src.services.licitacion_explorer_service import (
    analyze_file_bytes,
    build_analysis_csv_text,
    build_analysis_xlsx_bytes,
    build_checklist_pdf_bytes,
    build_licitacion_explorer,
    obtener_codigos_desde_texto,
)
from src.utils.permissions import has_permission

router = APIRouter(prefix="/api/licitaciones", tags=["licitaciones"])

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


def _user_empresa_ids(current_user: User) -> List[uuid.UUID]:
    empresa_ids = []
    for item in getattr(current_user, "empresas", []) or []:
        empresa_id = _extract_empresa_id(item)
        if empresa_id:
            try:
                empresa_ids.append(uuid.UUID(str(empresa_id)))
            except (TypeError, ValueError):
                continue
    return empresa_ids


def _has_empresa_access(current_user: User, empresa_id: uuid.UUID) -> bool:
    if _is_admin(current_user):
        return True
    return any(str(_extract_empresa_id(item)) == str(empresa_id) for item in (getattr(current_user, "empresas", []) or []))


def _accessible_scope(current_user: User):
    if _is_admin(current_user):
        return None
    return _user_empresa_ids(current_user)


def _require_licitacion_access(current_user: User, licitacion) -> None:
    if not _has_empresa_access(current_user, licitacion["empresa_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta licitacion",
        )


@router.get("/", response_model=List[LicitacionResponse])
def get_licitaciones(
    empresa_id: Optional[uuid.UUID] = None,
    estado: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener lista de licitaciones."""
    if empresa_id and not _has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )

    scope = None if _is_admin(current_user) else _accessible_scope(current_user)
    return LicitacionController.get_licitaciones(db, empresa_id=empresa_id, estado=estado, skip=skip, limit=limit, empresa_ids=scope)


@router.get("/dashboard/resumen", response_model=DashboardResumen)
def get_dashboard_resumen(
    empresa_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener resumen del dashboard para una empresa o de forma global."""
    if empresa_id and not _has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )

    scope = None if _is_admin(current_user) else _accessible_scope(current_user)
    return LicitacionController.get_dashboard_resumen(db, empresa_id=empresa_id, empresa_ids=scope)


@router.get("/dashboard/proximos-cierres", response_model=List[ProximoCierre])
def get_proximos_cierres(
    empresa_id: Optional[uuid.UUID] = None,
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener proximos cierres de licitaciones."""
    if empresa_id and not _has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )

    scope = None if _is_admin(current_user) else _accessible_scope(current_user)
    return LicitacionController.get_proximos_cierres(empresa_id, limit, db, empresa_ids=scope)


@router.get("/{licitacion_id}/explorador")
def get_explorador(
    licitacion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener el explorador completo de una licitacion."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)
    return build_licitacion_explorer(licitacion_id, db)


@router.post("/{licitacion_id}/checklist/pdf")
async def generar_checklist_pdf(
    licitacion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Genera un PDF con el estado actual del checklist y lo guarda como documento
    dentro de la carpeta de esta licitacion."""
    from src.controllers.documento_controller import DocumentoController
    from src.models.licitacion import Licitacion as LicitacionModel
    from src.schemas.documento import DocumentoCreate
    from src.utils.file_handlers import FileHandler

    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    licitacion_row = db.query(LicitacionModel).filter(LicitacionModel.id == licitacion_id).first()
    if not licitacion_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Licitacion no encontrada")

    explorer_data = build_licitacion_explorer(licitacion_id, db)

    pdf_bytes = await run_in_threadpool(
        build_checklist_pdf_bytes,
        licitacion_row,
        explorer_data["documentos_obligatorios"],
        explorer_data["resumen_documental"],
    )

    carpeta = DocumentoController.get_or_create_carpeta_licitacion(
        licitacion_id, licitacion_row.empresa_id, licitacion_row.numero_secop, db
    )

    nombre_archivo = f"Checklist_{licitacion_row.numero_secop or licitacion_id}.pdf"
    saved_file = FileHandler().save_bytes(
        pdf_bytes,
        nombre_archivo,
        subfolder=f"documentos/{licitacion_row.empresa_id}",
    )

    documento_data = DocumentoCreate(
        carpeta_id=carpeta.id,
        empresa_id=licitacion_row.empresa_id,
        nombre=f"Checklist {licitacion_row.numero_secop or ''}".strip(),
        nombre_original=nombre_archivo,
        tipo_documento="checklist",
        descripcion="Reporte de cumplimiento del checklist, generado automaticamente.",
        ruta_archivo=saved_file["filepath"],
        tamanio_bytes=saved_file["size"],
        formato="pdf",
        version="1.0",
        vigente=True,
        meta_data={
            "origen": "checklist_pdf",
            "cobertura_porcentaje": explorer_data["resumen_documental"].get("cobertura_porcentaje"),
        },
        usuario_subida=current_user.id,
    )

    documento = DocumentoController.create_documento(documento_data, current_user.id, db)
    documento_id = documento.get("id") if isinstance(documento, dict) else documento.id

    return {
        "message": "Checklist en PDF generado y guardado en la biblioteca de este proceso",
        "documento_id": str(documento_id),
    }


class EvaluarRequisitosPayload(BaseModel):
    documento_id: uuid.UUID


@router.get("/{licitacion_id}/requisitos", response_model=List[RequisitoResponse])
def get_requisitos(
    licitacion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listar los indicadores/requisitos de una licitacion."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)
    return RequisitoController.list_requisitos(licitacion_id, db)


@router.post("/{licitacion_id}/requisitos", response_model=RequisitoResponse, status_code=status.HTTP_201_CREATED)
def create_requisito(
    licitacion_id: uuid.UUID,
    data: RequisitoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crear un indicador/requisito para una licitacion."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    if not (_is_admin(current_user) or has_permission(current_user, "checklist.gestionar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para gestionar el checklist",
        )

    return RequisitoController.create_requisito(licitacion_id, data, db)


@router.put("/{licitacion_id}/requisitos/{requisito_id}", response_model=RequisitoResponse)
def update_requisito(
    licitacion_id: uuid.UUID,
    requisito_id: uuid.UUID,
    data: RequisitoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualizar un indicador/requisito de una licitacion."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)
    return RequisitoController.update_requisito(requisito_id, data, db)


@router.delete("/{licitacion_id}/requisitos/{requisito_id}", response_model=MessageResponse)
def delete_requisito(
    licitacion_id: uuid.UUID,
    requisito_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Eliminar un indicador/requisito de una licitacion."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    if not (_is_admin(current_user) or has_permission(current_user, "checklist.gestionar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para gestionar el checklist",
        )

    return RequisitoController.delete_requisito(requisito_id, db)


@router.delete("/{licitacion_id}/checklist-obligatorio/{key}", response_model=MessageResponse)
def excluir_documento_obligatorio(
    licitacion_id: uuid.UUID,
    key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quitar un documento obligatorio por defecto (no personalizado) del checklist de esta licitacion."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    if not (_is_admin(current_user) or has_permission(current_user, "checklist.gestionar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para gestionar el checklist",
        )

    excluidos = set(licitacion.checklist_excluidos or [])
    excluidos.add(key)
    licitacion.checklist_excluidos = list(excluidos)
    db.commit()

    return {"message": "Documento obligatorio quitado del checklist de esta licitacion"}


@router.post("/{licitacion_id}/requisitos/evaluar")
def evaluar_requisitos(
    licitacion_id: uuid.UUID,
    payload: EvaluarRequisitosPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Evaluar los indicadores tipo 'especifico' contra un documento RUP ya cargado."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)
    return RequisitoController.evaluar_requisitos(licitacion_id, payload.documento_id, db)


@router.post("/{licitacion_id}/analizar-pliego")
async def analyze_pliego(
    licitacion_id: uuid.UUID,
    file: UploadFile = File(...),
    codigos_busqueda: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Analizar un pliego con OCR y busqueda UNSPSC."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo esta vacio",
        )

    codigos = obtener_codigos_desde_texto(codigos_busqueda or "")
    analysis = await run_in_threadpool(analyze_file_bytes, file_bytes, file.filename or "", codigos)

    return {
        "licitacion_id": str(licitacion_id),
        "archivo": analysis["archivo"],
        "experiencias": analysis["experiencias"],
        "coincidencias": analysis["coincidencias"],
        "codigos_extraidos": analysis["codigos_extraidos"],
        "resumen": analysis["resumen"],
        "texto_preview": analysis["texto_preview"],
        "texto_completo": analysis["texto_completo"],
        "codigos_busqueda": analysis["resumen"].get("codigos_busqueda", []),
    }


@router.post("/{licitacion_id}/analizar-pliego/export")
async def export_pliego_analysis(
    licitacion_id: uuid.UUID,
    file: UploadFile = File(...),
    codigos_busqueda: Optional[str] = Form(None),
    formato: str = Form("xlsx"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exportar el analisis del pliego en XLSX o CSV."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo esta vacio",
        )

    codigos = obtener_codigos_desde_texto(codigos_busqueda or "")
    analysis = await run_in_threadpool(analyze_file_bytes, file_bytes, file.filename or "", codigos)
    formato_normalizado = (formato or "xlsx").strip().lower()

    if formato_normalizado == "csv":
        csv_text = build_analysis_csv_text(analysis)
        filename = f"analisis_pliego_{licitacion_id}.csv"
        return Response(
            content=csv_text.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    xlsx_bytes = build_analysis_xlsx_bytes(analysis)
    filename = f"analisis_pliego_{licitacion_id}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{licitacion_id}", response_model=LicitacionResponse)
def get_licitacion(
    licitacion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener una licitacion por su ID."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)
    return licitacion


@router.post("/", response_model=LicitacionResponse, status_code=status.HTTP_201_CREATED)
def create_licitacion(
    licitacion_data: LicitacionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crear una nueva licitacion."""
    if not _has_empresa_access(current_user, licitacion_data.empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )

    if not (_is_admin(current_user) or has_permission(current_user, "licitaciones.crear")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para crear licitaciones",
        )

    usuario_id = current_user.id
    return LicitacionController.create_licitacion(licitacion_data, usuario_id, db)


@router.put("/{licitacion_id}", response_model=LicitacionResponse)
def update_licitacion(
    licitacion_id: uuid.UUID,
    licitacion_data: LicitacionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualizar una licitacion existente."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)
    return LicitacionController.update_licitacion(licitacion_id, licitacion_data, db)


@router.delete("/{licitacion_id}", response_model=MessageResponse)
def delete_licitacion(
    licitacion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Eliminar una licitacion (solo si esta en estado en_busqueda)."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    if not (_is_admin(current_user) or has_permission(current_user, "licitaciones.eliminar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para eliminar licitaciones",
        )

    return LicitacionController.delete_licitacion(licitacion_id, db)
