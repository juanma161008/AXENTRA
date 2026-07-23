from sqlalchemy import Column, String, Boolean, DateTime, Text, Numeric, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.config.database import Base
import uuid

class Licitacion(Base):
    __tablename__ = "licitaciones"
    __table_args__ = {"schema": "licitaciones"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(UUID(as_uuid=True), nullable=False)
    numero_secop = Column(String(50), unique=True)
    url_secop = Column(Text)
    entidad_contratante = Column(String(500))
    nit_entidad = Column(String(20))
    objeto_contrato = Column(Text)
    cuantia = Column(Numeric(15, 2))
    estado = Column(String(50), default="en_busqueda")
    fecha_publicacion = Column(DateTime(timezone=True))
    fecha_apertura = Column(DateTime(timezone=True))
    fecha_cierre = Column(DateTime(timezone=True))
    fecha_subsanacion = Column(DateTime(timezone=True))
    fecha_adjudicacion = Column(DateTime(timezone=True))
    fecha_visita_obra = Column(DateTime(timezone=True))
    fecha_consultas = Column(DateTime(timezone=True))
    fecha_cierre_dudas = Column(DateTime(timezone=True))
    fecha_evaluacion = Column(DateTime(timezone=True))
    fechas_personalizadas = Column(JSON, default=list)
    pliego_url = Column(Text)
    pliego_texto = Column(Text)
    rup_url = Column(Text)
    rup_texto = Column(Text)
    checklist_excluidos = Column(JSON, default=list)
    indicadores_financieros_requeridos = Column(JSON, default=dict)
    indicadores_financieros_rup_manual = Column(JSON, default=dict)
    notas = Column(Text)
    usuario_creador = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class RequisitoChecklist(Base):
    __tablename__ = "requisitos_checklist"
    __table_args__ = {"schema": "licitaciones"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    licitacion_id = Column(UUID(as_uuid=True), nullable=False)
    nombre = Column(String(500), nullable=False)
    descripcion_original = Column(Text)
    tipo = Column(String(50), nullable=False)
    estado = Column(String(50), default="pendiente")
    requisito_especifico = Column(JSON)
    cumple_validacion = Column(Boolean)
    valor_solicitado = Column(String(200))
    valor_calculado = Column(String(200))
    documento_id = Column(UUID(as_uuid=True))
    obligatorio = Column(Boolean, default=True)
    orden = Column(Numeric, default=0)
    creado_por_ia = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class HistorialEstado(Base):  # ← AGREGADO
    __tablename__ = "historial_estados"
    __table_args__ = {"schema": "licitaciones"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    licitacion_id = Column(UUID(as_uuid=True), nullable=False)
    estado_anterior = Column(String(50))
    estado_nuevo = Column(String(50), nullable=False)
    comentario = Column(Text)
    usuario_id = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChecklistEstado(Base):
    """Estado manual (checkbox) de un item de checklist: quien lo marco y cuando.
    Fuente de verdad de "cumplido", independiente de si se subio o no un documento."""

    __tablename__ = "checklist_estados"
    __table_args__ = {"schema": "licitaciones"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    licitacion_id = Column(UUID(as_uuid=True), nullable=False)
    item_key = Column(String(200), nullable=False)
    cumplido = Column(Boolean, default=False)
    documento_id = Column(UUID(as_uuid=True), nullable=True)
    validado_por = Column(UUID(as_uuid=True), nullable=True)
    validado_en = Column(DateTime(timezone=True), nullable=True)
    requiere_subsanacion = Column(Boolean, default=False)
    notas_subsanacion = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ConfiguracionAlertas(Base):
    """Configuracion global (singleton) de los umbrales del semaforo de alertas."""

    __tablename__ = "configuracion_alertas"
    __table_args__ = {"schema": "licitaciones"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dias_rojo = Column(Integer, default=7)
    dias_naranja = Column(Integer, default=15)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by = Column(UUID(as_uuid=True), nullable=True)