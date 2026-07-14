from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.auth.auth import get_current_user
from src.config.database import get_db
from src.models.rol import Rol
from src.models.user import User
from src.schemas.user import RolResponse

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("/", response_model=List[RolResponse])
def get_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Listar roles disponibles para asignación y administración"""
    return db.query(Rol).order_by(Rol.nombre.asc()).all()
