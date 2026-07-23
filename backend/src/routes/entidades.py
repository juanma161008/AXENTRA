from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.entidad_controller import EntidadController
from src.models.user import User
from src.schemas.entidad import EntidadCreate, EntidadImportResponse, EntidadResponse, EntidadUpdate, MessageResponse
from src.utils.permissions import has_permission

router = APIRouter(prefix="/api/entidades", tags=["entidades"])

ADMIN_ROLES = {"super_admin", "admin_empresa"}


def _require_admin(current_user: User) -> None:
    """Admin de rol, o con el permiso puntual 'entidades.gestionar' otorgado."""
    is_admin = bool(set(getattr(current_user, "roles", []) or []).intersection(ADMIN_ROLES))
    if is_admin or has_permission(current_user, "entidades.gestionar"):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para realizar esta accion",
    )


@router.get("/", response_model=List[EntidadResponse])
def get_entidades(
    skip: int = 0,
    limit: int = 100,
    activo: Optional[bool] = None,
    q: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listar entidades contratantes (cualquier usuario autenticado, para autocompletar)."""
    return EntidadController.get_entidades(db, skip, limit, activo, q)


@router.get("/buscar", response_model=Optional[EntidadResponse])
def buscar_entidad_por_nit(
    nit: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Buscar una entidad por NIT exacto, para autocompletar el formulario de licitacion."""
    return EntidadController.buscar_por_nit(nit, db)


@router.post("/importar", response_model=EntidadImportResponse)
async def importar_entidades(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Importar entidades masivamente desde un Excel con columnas 'Nombre' y 'NIT'."""
    _require_admin(current_user)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío")

    return EntidadController.import_from_excel(file_bytes, db)


@router.get("/{entidad_id}", response_model=EntidadResponse)
def get_entidad(
    entidad_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return EntidadController.get_entidad(entidad_id, db)


@router.post("/", response_model=EntidadResponse, status_code=status.HTTP_201_CREATED)
def create_entidad(
    data: EntidadCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    return EntidadController.create_entidad(data, db)


@router.put("/{entidad_id}", response_model=EntidadResponse)
def update_entidad(
    entidad_id: uuid.UUID,
    data: EntidadUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    return EntidadController.update_entidad(entidad_id, data, db)


@router.delete("/{entidad_id}", response_model=MessageResponse)
def delete_entidad(
    entidad_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    return EntidadController.delete_entidad(entidad_id, db)
