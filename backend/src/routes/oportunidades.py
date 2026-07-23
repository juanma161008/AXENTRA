import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.oportunidad_controller import OportunidadController
from src.models.user import User
from src.schemas.oportunidad import OportunidadCreate, OportunidadResponse, OportunidadUpdate

router = APIRouter(prefix="/api/oportunidades", tags=["oportunidades"])

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


def _has_empresa_access(current_user: User, empresa_id) -> bool:
    if _is_admin(current_user):
        return True
    return any(str(_extract_empresa_id(item)) == str(empresa_id) for item in (getattr(current_user, "empresas", []) or []))


@router.post("/", response_model=OportunidadResponse, status_code=status.HTTP_201_CREATED)
def crear_oportunidad(
    payload: OportunidadCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deja un aviso rapido (URL de SECOP + comentario) para que el equipo lo revise, sin
    depender de un Word en una carpeta compartida que a veces nadie mira a tiempo. Sin
    empresa_id queda sin asignar (visible para todos) hasta que alguien la convierta en
    licitacion de una empresa concreta."""
    if payload.empresa_id and not _has_empresa_access(current_user, payload.empresa_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a esta empresa")

    return OportunidadController.create_oportunidad(payload, current_user.id, db)


@router.get("/", response_model=List[OportunidadResponse])
def listar_oportunidades(
    empresa_id: Optional[uuid.UUID] = None,
    estado: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if empresa_id and not _has_empresa_access(current_user, empresa_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a esta empresa")

    scope = None if _is_admin(current_user) else _user_empresa_ids(current_user)
    return OportunidadController.list_oportunidades(db, empresa_id=empresa_id, empresa_ids=scope, estado=estado)


@router.patch("/{oportunidad_id}", response_model=OportunidadResponse)
def actualizar_oportunidad(
    oportunidad_id: uuid.UUID,
    payload: OportunidadUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tambien se usa para asignar/reasignar la empresa de una oportunidad en cualquier
    momento (no solo al crearla) -- cualquiera con acceso a la empresa destino la puede
    tomar, tipicamente un editor asignando una oportunidad que el jefe dejo sin empresa."""
    if "empresa_id" in payload.model_fields_set and payload.empresa_id and not _has_empresa_access(current_user, payload.empresa_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a esa empresa")

    return OportunidadController.update_oportunidad(oportunidad_id, payload, current_user.id, db)


@router.delete("/{oportunidad_id}")
def eliminar_oportunidad(
    oportunidad_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return OportunidadController.delete_oportunidad(oportunidad_id, db)
