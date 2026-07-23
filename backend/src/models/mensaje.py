from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.config.database import Base
import uuid


class Mensaje(Base):
    """Mensajeria interna entre usuarios de la plataforma (un 'correo local' que no sale de
    la app ni depende de un servidor SMTP real): asunto + cuerpo, de un usuario a otro."""

    __tablename__ = "mensajes"
    __table_args__ = {"schema": "seguridad"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nulo para avisos automaticos del sistema (alertas criticas) que no los dispara un
    # usuario en concreto -- se muestran como si los mandara "Sistema".
    remitente_id = Column(UUID(as_uuid=True), nullable=True)
    destinatario_id = Column(UUID(as_uuid=True), nullable=False)
    asunto = Column(String(255))
    cuerpo = Column(Text, nullable=False)
    # mensaje | oportunidad | checklist | alerta -- para poder distinguir en pantalla los
    # avisos automaticos (sobre todo "alerta", que se resalta distinto por ser critico).
    tipo = Column(String(30), default="mensaje")
    leido = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
