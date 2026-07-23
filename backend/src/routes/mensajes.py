import uuid
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.controllers.mensaje_controller import MensajeController
from src.models.user import User
from src.schemas.mensaje import ContactoResponse, MensajeCreate, MensajeResponse

router = APIRouter(prefix="/api/mensajes", tags=["mensajes"])

ADMIN_ROLES = {"super_admin", "admin_empresa"}


def _is_admin(current_user: User) -> bool:
    return bool(set(getattr(current_user, "roles", []) or []).intersection(ADMIN_ROLES))


@router.get("/contactos", response_model=List[ContactoResponse])
def listar_contactos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A quien le puede escribir el usuario actual (compañeros de su empresa, o cualquiera
    si es admin)."""
    return MensajeController.listar_contactos(current_user.id, _is_admin(current_user), db)


@router.post("/", response_model=MensajeResponse, status_code=201)
def enviar_mensaje(
    payload: MensajeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manda un mensaje interno a otro usuario -- una mensajeria local dentro de la propia
    app, sin depender de un servidor de correo externo."""
    return MensajeController.enviar_mensaje(payload, current_user.id, _is_admin(current_user), db)


@router.get("/", response_model=List[MensajeResponse])
def listar_mensajes(
    carpeta: str = Query("recibidos", pattern="^(recibidos|enviados)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return MensajeController.listar_mensajes(current_user.id, carpeta, db)


@router.get("/no-leidos")
def contar_no_leidos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"no_leidos": MensajeController.contar_no_leidos(current_user.id, db)}


@router.patch("/{mensaje_id}/leido", response_model=MensajeResponse)
def marcar_leido(
    mensaje_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return MensajeController.marcar_leido(mensaje_id, current_user.id, db)


@router.delete("/{mensaje_id}")
def eliminar_mensaje(
    mensaje_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return MensajeController.eliminar_mensaje(mensaje_id, current_user.id, db)
