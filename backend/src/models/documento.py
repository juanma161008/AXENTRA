from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, BigInteger, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.config.database import Base
import uuid

class Carpeta(Base):
    __tablename__ = "carpetas"
    __table_args__ = {"schema": "documentos"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(UUID(as_uuid=True), nullable=False)
    carpeta_padre_id = Column(UUID(as_uuid=True), nullable=True)
    licitacion_id = Column(UUID(as_uuid=True), nullable=True)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text)
    icono = Column(String(50), default="folder")
    color = Column(String(20), default="#3b82f6")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Documento(Base):
    __tablename__ = "documentos"
    __table_args__ = {"schema": "documentos"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    carpeta_id = Column(UUID(as_uuid=True), nullable=True)
    empresa_id = Column(UUID(as_uuid=True), nullable=False)
    nombre = Column(String(255), nullable=False)
    nombre_original = Column(String(500))
    tipo_documento = Column(String(100))
    descripcion = Column(Text)
    ruta_archivo = Column(Text, nullable=False)
    tamanio_bytes = Column(BigInteger)
    formato = Column(String(10))
    version = Column(String(20), default="1.0")
    vigente = Column(Boolean, default=True)
    fecha_vencimiento = Column(DateTime(timezone=True))
    tags = Column(Text)
    meta_data = Column("metadata", JSON)
    usuario_subida = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class VersionDocumento(Base):
    __tablename__ = "versiones_documentos"
    __table_args__ = {"schema": "documentos"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    documento_id = Column(UUID(as_uuid=True), nullable=False)
    version = Column(String(20), nullable=False)
    ruta_archivo = Column(Text, nullable=False)
    tamanio_bytes = Column(BigInteger)
    cambios = Column(Text)
    usuario_id = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
