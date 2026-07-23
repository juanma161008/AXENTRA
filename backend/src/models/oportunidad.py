from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.config.database import Base
import uuid


class Oportunidad(Base):
    """Aviso rapido (URL de SECOP + comentario libre) que cualquiera del equipo puede dejar
    para que no se pierda un proceso mientras alguien decide si vale la pena convertirlo en
    licitacion. Pensado para reemplazar el flujo de "un Word en una carpeta compartida que
    a veces no se revisa" por algo visible dentro de la app."""

    __tablename__ = "oportunidades"
    __table_args__ = {"schema": "licitaciones"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nula cuando un admin la deja sin asignar a una empresa todavia (queda visible para
    # todos); se asigna al convertirla en licitacion, ahi si con dueno definido.
    empresa_id = Column(UUID(as_uuid=True), nullable=True)
    url_secop = Column(Text, nullable=False)
    comentario = Column(Text)
    fecha_presentacion = Column(DateTime(timezone=True), nullable=True)
    estado = Column(String(30), default="pendiente")  # pendiente | revisada | convertida | descartada
    licitacion_id = Column(UUID(as_uuid=True), nullable=True)
    creado_por = Column(UUID(as_uuid=True))
    revisado_por = Column(UUID(as_uuid=True), nullable=True)
    revisado_en = Column(DateTime(timezone=True), nullable=True)
    # Quien la asigno (o reasigno) a una empresa y cuando -- distinto de quien la creo,
    # para poder mostrar el flujo completo (creada -> revisada -> empresa asignada ->
    # convertida) en vez de solo un estado final sin historia.
    empresa_asignada_por = Column(UUID(as_uuid=True), nullable=True)
    empresa_asignada_en = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
