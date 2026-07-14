from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.config.database import Base
import uuid

class Empresa(Base):
    __tablename__ = "empresas"
    __table_args__ = {"schema": "negocio"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grupo_empresarial_id = Column(UUID(as_uuid=True), nullable=True)
    nombre = Column(String(255), nullable=False)
    nit = Column(String(20), unique=True, nullable=False)
    direccion = Column(Text)
    telefono = Column(String(20))
    email = Column(String(255))
    sitio_web = Column(String(255))
    logo_url = Column(Text)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())