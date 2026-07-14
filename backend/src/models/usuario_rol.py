from sqlalchemy import Column, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from src.config.database import Base


class UsuarioRol(Base):
    __tablename__ = "usuarios_roles"
    __table_args__ = {"schema": "seguridad"}

    usuario_id = Column(UUID(as_uuid=True), primary_key=True)
    rol_id = Column(UUID(as_uuid=True), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
