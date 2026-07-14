from sqlalchemy import Column, String, DateTime, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.config.database import Base
import uuid

class LogActividad(Base):
    __tablename__ = "log_actividad"
    __table_args__ = {"schema": "auditoria", "extend_existing": True}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), nullable=True)
    empresa_id = Column(UUID(as_uuid=True), nullable=True)
    accion = Column(String(255), nullable=False)
    tabla_afectada = Column(String(100))
    registro_id = Column(UUID(as_uuid=True))
    datos_anteriores = Column(JSON)
    datos_nuevos = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())