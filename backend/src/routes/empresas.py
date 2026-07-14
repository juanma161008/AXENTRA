from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.empresa_controller import EmpresaController
from src.models.user import User
from src.models.usuario_empresa import UsuarioEmpresa
from src.schemas.empresa import (
    EmpresaCreate,
    EmpresaResponse,
    EmpresaUpdate,
    MessageResponse,
    UsuarioEmpresaCreate,
    UsuarioEmpresaResponse,
)
from src.utils.permissions import has_permission

router = APIRouter(prefix="/api/empresas", tags=["empresas"])

ADMIN_ROLES = {"super_admin", "admin_empresa"}


def _is_admin(current_user: User) -> bool:
    return bool(set(getattr(current_user, "roles", []) or []).intersection(ADMIN_ROLES))


def _require_admin(current_user: User) -> None:
    """Admin de rol, o con el permiso puntual 'empresas.gestionar' otorgado."""
    if _is_admin(current_user) or has_permission(current_user, "empresas.gestionar"):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para realizar esta accion",
    )


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


def _user_has_empresa_access(current_user: User, empresa_id: uuid.UUID) -> bool:
    if _is_admin(current_user):
        return True
    return any(str(_extract_empresa_id(item)) == str(empresa_id) for item in (current_user.empresas or []))


@router.get("/", response_model=List[EmpresaResponse])
def get_empresas(
    skip: int = 0,
    limit: int = 100,
    activo: bool = None,
    nit: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtener lista de empresas (paginado y filtrado)."""
    return EmpresaController.get_empresas(db, current_user, skip, limit, activo, nit)


@router.get("/{empresa_id}", response_model=EmpresaResponse)
def get_empresa(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtener una empresa por su ID."""
    if not _user_has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )
    return EmpresaController.get_empresa(empresa_id, db)


@router.post("/", response_model=EmpresaResponse, status_code=status.HTTP_201_CREATED)
def create_empresa(
    empresa_data: EmpresaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crear una nueva empresa."""
    _require_admin(current_user)
    return EmpresaController.create_empresa(empresa_data, db)


@router.put("/{empresa_id}", response_model=EmpresaResponse)
def update_empresa(
    empresa_id: uuid.UUID,
    empresa_data: EmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualizar una empresa existente."""
    _require_admin(current_user)
    return EmpresaController.update_empresa(empresa_id, empresa_data, db)


@router.delete("/{empresa_id}", response_model=MessageResponse)
def delete_empresa(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Desactivar una empresa (eliminación lógica)."""
    _require_admin(current_user)
    return EmpresaController.delete_empresa(empresa_id, db)


@router.post("/asignar-usuario", response_model=UsuarioEmpresaResponse)
def asignar_usuario_empresa(
    data: UsuarioEmpresaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Asignar un usuario a una empresa con un rol."""
    _require_admin(current_user)

    existing = (
        db.query(UsuarioEmpresa)
        .filter(
            UsuarioEmpresa.usuario_id == data.usuario_id,
            UsuarioEmpresa.empresa_id == data.empresa_id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario ya esta asignado a esta empresa",
        )

    asignacion = UsuarioEmpresa(
        id=uuid.uuid4(),
        **data.model_dump(),
        activo=True,
    )

    db.add(asignacion)
    db.commit()
    db.refresh(asignacion)

    return asignacion


@router.get("/{empresa_id}/usuarios")
def get_usuarios_empresa(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtener todos los usuarios de una empresa."""
    if not _user_has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )
    _require_admin(current_user)
    return EmpresaController.get_usuarios_empresa(empresa_id, db)


@router.get("/{empresa_id}/estadisticas")
def get_estadisticas_empresa(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtener estadísticas de una empresa."""
    if not _user_has_empresa_access(current_user, empresa_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )
    _require_admin(current_user)
    return EmpresaController.get_estadisticas_empresa(empresa_id, db)
