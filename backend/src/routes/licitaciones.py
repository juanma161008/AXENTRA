from typing import Any, Dict, List, Optional
import uuid


from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.checklist_estado_controller import ChecklistEstadoController
from src.controllers.licitacion_controller import LicitacionController
from src.controllers.requisito_controller import RequisitoController
from src.models.user import User
from src.schemas.licitacion import (
    ChecklistActividadItem,
    ChecklistItemUpdate,
    ConfiguracionAlertasResponse,
    ConfiguracionAlertasUpdate,
    DashboardResumen,
    LicitacionCreate,
    LicitacionResponse,
    LicitacionUpdate,
    MessageResponse,
    ProximoCierre,
    RequisitoCreate,
    RequisitoResponse,
    RequisitoUpdate,
    SemaforoResumen,
    SubsanacionUpdate,
)
from src.services.licitacion_explorer_service import (
    analyze_file_bytes,
    build_analysis_csv_text,
    build_analysis_xlsx_bytes,
    build_checklist_actividad,
    build_checklist_pdf_bytes,
    build_comparativo_pdf_bytes,
    build_licitacion_explorer,
    buscar_coincidencias,
    comparar_codigos_pliego_rup,
    extraer_experiencias,
    formatear_codigo,
    limpiar_codigo,
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


@router.get("/dashboard/semaforo", response_model=SemaforoResumen)
def get_semaforo_resumen(
    empresa_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Conteo de licitaciones activas por color de semaforo (rojo/naranja/verde)."""
    if empresa_id and not _has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )

    scope = None if _is_admin(current_user) else _accessible_scope(current_user)
    return LicitacionController.get_semaforo_resumen(db, empresa_id=empresa_id, empresa_ids=scope)


@router.get("/configuracion-alertas", response_model=ConfiguracionAlertasResponse)
def get_configuracion_alertas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Umbrales (dias) del semaforo de alertas."""
    return LicitacionController.get_configuracion_alertas(db)


@router.put("/configuracion-alertas", response_model=ConfiguracionAlertasResponse)
def update_configuracion_alertas(
    data: ConfiguracionAlertasUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualizar los umbrales del semaforo de alertas. Solo administradores."""
    if not _is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador puede cambiar los umbrales de alertas",
        )

    return LicitacionController.update_configuracion_alertas(data.dias_rojo, data.dias_naranja, current_user.id, db)


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


@router.patch("/{licitacion_id}/checklist/{item_key}")
def actualizar_checklist_item(
    licitacion_id: uuid.UUID,
    item_key: str,
    data: ChecklistItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca/desmarca un item del checklist como cumplido. Manual, no depende de subir
    ningun archivo (el documento_id es opcional)."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    estado = ChecklistEstadoController.update_item(
        licitacion_id, item_key, data.cumplido, data.documento_id, current_user.id, db
    )
    return {
        "item_key": estado.item_key,
        "cumplido": estado.cumplido,
        "documento_id": str(estado.documento_id) if estado.documento_id else None,
        "validado_por": str(estado.validado_por) if estado.validado_por else None,
        "validado_en": estado.validado_en,
        "requiere_subsanacion": estado.requiere_subsanacion,
    }


@router.post("/{licitacion_id}/checklist/{item_key}/subsanar")
def marcar_subsanar(
    licitacion_id: uuid.UUID,
    item_key: str,
    data: SubsanacionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca un item como 'a subsanar' (entra al semaforo en rojo). Solo revisores/admin."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    if not (_is_admin(current_user) or has_permission(current_user, "checklist.gestionar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para gestionar el checklist",
        )

    estado = ChecklistEstadoController.marcar_subsanacion(licitacion_id, item_key, data.notas, db)
    return {
        "item_key": estado.item_key,
        "requiere_subsanacion": estado.requiere_subsanacion,
        "notas_subsanacion": estado.notas_subsanacion,
    }


@router.delete("/{licitacion_id}/checklist/{item_key}/subsanar", response_model=MessageResponse)
def resolver_subsanar(
    licitacion_id: uuid.UUID,
    item_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quita la marca de 'a subsanar' de un item sin necesidad de re-cargar un documento."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    if not (_is_admin(current_user) or has_permission(current_user, "checklist.gestionar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para gestionar el checklist",
        )

    ChecklistEstadoController.resolver_subsanacion(licitacion_id, item_key, db)
    return {"message": "Subsanacion resuelta"}


@router.get("/{licitacion_id}/checklist/actividad", response_model=List[ChecklistActividadItem])
def get_checklist_actividad(
    licitacion_id: uuid.UUID,
    limit: int = 15,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actividad reciente del checklist: quien marco cada item y cuando."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)
    return build_checklist_actividad(str(licitacion_id), db, limit)


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

    # El archivo recien subido se asume como el pliego: cruza sus codigos UNSPSC contra el
    # RUP que ya este guardado en la licitacion (herramienta integrada de coincidencias).
    comparativo_codigos = comparar_codigos_pliego_rup(
        analysis["texto_completo"], licitacion.get("rup_texto"), licitacion.get("objeto_contrato")
    )

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
        "factor_desempate": analysis.get("factor_desempate", []),
        "requisitos_sugeridos": analysis.get("requisitos_sugeridos", []),
        "comparativo_codigos": comparativo_codigos,
    }


@router.post("/{licitacion_id}/buscar-codigos-unspsc")
def buscar_codigos_unspsc(
    licitacion_id: uuid.UUID,
    codigos_busqueda: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Busca codigos UNSPSC escritos a mano contra el RUP que ya quedo analizado y guardado
    en la licitacion, sin exigir volver a subir el archivo cada vez -- solo hace falta
    subirlo (via /analizar-pliego) la primera vez o cuando de verdad cambie."""
    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    rup_texto = licitacion.get("rup_texto")
    if not rup_texto:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta licitación todavía no tiene un RUP analizado. Sube el archivo al menos una vez.",
        )

    codigos = obtener_codigos_desde_texto(codigos_busqueda or "")
    experiencias = extraer_experiencias(rup_texto)
    coincidencias = buscar_coincidencias(experiencias, codigos) if codigos else []

    return {
        "codigos_busqueda": [formatear_codigo(limpiar_codigo(c)) for c in codigos],
        "coincidencias": coincidencias,
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


@router.get("/{licitacion_id}/comparativo-codigos/pdf")
async def exportar_comparativo_codigos_pdf(
    licitacion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exporta en PDF el cruce de codigos UNSPSC (pliego vs RUP) ya guardado en la licitacion."""
    from src.models.licitacion import Licitacion as LicitacionModel

    licitacion = LicitacionController.get_licitacion(licitacion_id, db)
    _require_licitacion_access(current_user, licitacion)

    licitacion_row = db.query(LicitacionModel).filter(LicitacionModel.id == licitacion_id).first()
    if not licitacion_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Licitacion no encontrada")

    comparativo = comparar_codigos_pliego_rup(
        licitacion_row.pliego_texto, licitacion_row.rup_texto, licitacion_row.objeto_contrato
    )
    if not comparativo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falta analizar el pliego y el RUP de esta licitacion antes de exportar",
        )

    pdf_bytes = await run_in_threadpool(build_comparativo_pdf_bytes, licitacion_row, comparativo)
    filename = f"coincidencias_{licitacion_row.numero_secop or licitacion_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
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


FECHA_UPDATE_FIELDS = {
    "fecha_publicacion",
    "fecha_apertura",
    "fecha_cierre",
    "fecha_subsanacion",
    "fecha_adjudicacion",
    "fecha_visita_obra",
    "fecha_consultas",
    "fecha_cierre_dudas",
    "fecha_evaluacion",
    "fechas_personalizadas",
}

DATOS_BASICOS_UPDATE_FIELDS = {
    "numero_secop",
    "url_secop",
    "entidad_contratante",
    "nit_entidad",
    "objeto_contrato",
    "cuantia",
    "notas",
}


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

    # PUT es de uso general (cronograma, datos basicos, estado, pliego/rup, indicadores...);
    # solo los grupos de campos que antes estaban admin-gated en el frontend (fechas y datos
    # basicos) exigen aqui un permiso granular, para que "otorgar permiso" en Administracion
    # realmente habilite a un usuario no admin a guardar esos cambios (antes el backend no
    # validaba nada y solo el frontend ocultaba el boton).
    campos_enviados = set(licitacion_data.model_dump(exclude_unset=True).keys())
    es_admin = _is_admin(current_user)

    if campos_enviados & FECHA_UPDATE_FIELDS and not (es_admin or has_permission(current_user, "licitaciones.editar_fechas")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar el cronograma de esta licitación",
        )

    if campos_enviados & DATOS_BASICOS_UPDATE_FIELDS and not (es_admin or has_permission(current_user, "licitaciones.editar")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar los datos de esta licitación",
        )

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
