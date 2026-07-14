from sqlalchemy import Column, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.config.database import Base
import uuid

class UsuarioEmpresa(Base):
    __tablename__ = "usuarios_empresas"
    __table_args__ = {"schema": "seguridad"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), nullable=False)
    empresa_id = Column(UUID(as_uuid=True), nullable=False)
    rol_id = Column(UUID(as_uuid=True), nullable=False)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())