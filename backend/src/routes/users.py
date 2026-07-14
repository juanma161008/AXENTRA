from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.user_controller import UserController
from src.models.user import User
from src.schemas.empresa import EmpresaResponse
from src.schemas.user import (
    MessageResponse,
    PermisoStatus,
    PermisoUpdateRequest,
    UserCreate,
    UserEmpresaAssign,
    UserPasswordReset,
    UserResponse,
    UserRoleAssign,
    UserUpdate,
)
from src.utils.permissions import has_permission

router = APIRouter(prefix="/api/users", tags=["usuarios"])

ADMIN_ROLES = {"super_admin", "admin_empresa"}


def _is_admin(current_user: User) -> bool:
    return bool(set(getattr(current_user, "roles", []) or []).intersection(ADMIN_ROLES))


def _require_admin(current_user: User) -> None:
    """Admin de rol, o con el permiso puntual 'usuarios.gestionar' otorgado."""
    if _is_admin(current_user) or has_permission(current_user, "usuarios.gestionar"):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para realizar esta accion",
    )


def _require_admin_role_only(current_user: User) -> None:
    if not _is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta accion",
        )


@router.get("/", response_model=List[UserResponse])
def get_users(
    skip: int = 0,
    limit: int = 100,
    activo: bool = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener lista de usuarios (paginado)."""
    _require_admin(current_user)
    return UserController.get_users(db, skip, limit, activo)


@router.get("/me/empresas", response_model=List[EmpresaResponse])
def get_user_empresas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener las empresas del usuario autenticado."""
    return UserController.get_user_empresas(current_user.id, db)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener un usuario por su ID."""
    _require_admin(current_user)
    return UserController.get_user(user_id, db)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crear un nuevo usuario."""
    _require_admin(current_user)
    return UserController.create_user(user_data, db)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualizar un usuario existente."""
    return UserController.update_user(user_id, user_data, current_user, db)


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Desactivar un usuario (eliminacion logica)."""
    return UserController.delete_user(user_id, current_user, db)


@router.post("/{user_id}/reset-password", response_model=MessageResponse)
def reset_user_password(
    user_id: uuid.UUID,
    data: UserPasswordReset,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restablecer la contrasena de un usuario (solo administradores)."""
    _require_admin(current_user)
    return UserController.reset_password(user_id, data.new_password, db)


@router.get("/{user_id}/permisos", response_model=List[PermisoStatus])
def get_user_permisos(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Catalogo completo de permisos + estado efectivo para un usuario."""
    _require_admin_role_only(current_user)
    return UserController.get_permisos(user_id, db)


@router.put("/{user_id}/permisos", response_model=List[PermisoStatus])
def set_user_permisos(
    user_id: uuid.UUID,
    data: PermisoUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Otorgar/revocar permisos puntuales para un usuario."""
    _require_admin_role_only(current_user)
    return UserController.set_permisos(user_id, [item.model_dump() for item in data.permisos], db)


@router.post("/{user_id}/roles", response_model=UserResponse)
def assign_role_to_user(
    user_id: uuid.UUID,
    data: UserRoleAssign,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Asignar un rol global a un usuario."""
    _require_admin_role_only(current_user)
    return UserController.assign_role_to_user(user_id, data.rol_id, db)


@router.delete("/{user_id}/roles/{rol_id}", response_model=UserResponse)
def remove_role_from_user(
    user_id: uuid.UUID,
    rol_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quitar un rol global a un usuario."""
    _require_admin_role_only(current_user)
    return UserController.remove_role_from_user(user_id, rol_id, db)


@router.put("/{user_id}/empresas/{empresa_id}", response_model=UserResponse)
def upsert_user_empresa(
    user_id: uuid.UUID,
    empresa_id: uuid.UUID,
    data: UserEmpresaAssign,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Asignar o actualizar una empresa para un usuario."""
    _require_admin(current_user)
    return UserController.upsert_user_empresa(user_id, empresa_id, data.rol_id, db)


@router.delete("/{user_id}/empresas/{empresa_id}", response_model=UserResponse)
def remove_user_empresa(
    user_id: uuid.UUID,
    empresa_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Desactivar la asignacion de una empresa para un usuario."""
    _require_admin(current_user)
    return UserController.remove_user_empresa(user_id, empresa_id, db)
