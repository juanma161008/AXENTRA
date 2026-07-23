from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List, Dict
from datetime import datetime
from uuid import UUID
from decimal import Decimal

# ============================================
# ENUMS (como strings)
# ============================================
class EstadoLicitacion(str):
    EN_BUSQUEDA = "en_busqueda"
    EN_PREPARACION = "en_preparacion"
    PRESENTADA = "presentada"
    ADJUDICADA = "adjudicada"
    PERDIDA = "perdida"
    DESIERTA = "desierta"
    CANCELADA = "cancelada"

class TipoRequisito(str):
    GLOBAL = "global"
    ESPECIFICO = "especifico"
    CALCULADO = "calculado"

class EstadoRequisito(str):
    PENDIENTE = "pendiente"
    VINCULADO = "vinculado"
    CARGADO = "cargado"
    CUMPLE = "cumple"
    NO_CUMPLE = "no_cumple"
    POR_REVISAR = "por_revisar"

# ============================================
# LICITACION
# ============================================
class LicitacionBase(BaseModel):
    empresa_id: UUID
    numero_secop: Optional[str] = Field(None, max_length=50)
    url_secop: Optional[str] = None
    entidad_contratante: Optional[str] = Field(None, max_length=500)
    nit_entidad: Optional[str] = Field(None, max_length=20)
    objeto_contrato: Optional[str] = None
    cuantia: Optional[Decimal] = Field(None, max_digits=15, decimal_places=2)
    estado: Optional[str] = "en_busqueda"
    fecha_publicacion: Optional[datetime] = None
    fecha_apertura: Optional[datetime] = None
    fecha_cierre: Optional[datetime] = None
    fecha_subsanacion: Optional[datetime] = None
    fecha_adjudicacion: Optional[datetime] = None
    fecha_visita_obra: Optional[datetime] = None
    fecha_consultas: Optional[datetime] = None
    fecha_cierre_dudas: Optional[datetime] = None
    fecha_evaluacion: Optional[datetime] = None
    fechas_personalizadas: Optional[List[Dict]] = None
    pliego_url: Optional[str] = None
    pliego_texto: Optional[str] = None
    rup_url: Optional[str] = None
    rup_texto: Optional[str] = None
    indicadores_financieros_requeridos: Optional[Dict] = None
    indicadores_financieros_rup_manual: Optional[Dict] = None
    notas: Optional[str] = None

class LicitacionCreate(LicitacionBase):
    usuario_creador: Optional[UUID] = None

class LicitacionUpdate(BaseModel):
    numero_secop: Optional[str] = Field(None, max_length=50)
    url_secop: Optional[str] = None
    entidad_contratante: Optional[str] = Field(None, max_length=500)
    nit_entidad: Optional[str] = Field(None, max_length=20)
    objeto_contrato: Optional[str] = None
    cuantia: Optional[Decimal] = Field(None, max_digits=15, decimal_places=2)
    estado: Optional[str] = None
    fecha_publicacion: Optional[datetime] = None
    fecha_apertura: Optional[datetime] = None
    fecha_cierre: Optional[datetime] = None
    fecha_subsanacion: Optional[datetime] = None
    fecha_adjudicacion: Optional[datetime] = None
    fecha_visita_obra: Optional[datetime] = None
    fecha_consultas: Optional[datetime] = None
    fecha_cierre_dudas: Optional[datetime] = None
    fecha_evaluacion: Optional[datetime] = None
    fechas_personalizadas: Optional[List[Dict]] = None
    pliego_url: Optional[str] = None
    pliego_texto: Optional[str] = None
    rup_url: Optional[str] = None
    rup_texto: Optional[str] = None
    indicadores_financieros_requeridos: Optional[Dict] = None
    indicadores_financieros_rup_manual: Optional[Dict] = None
    notas: Optional[str] = None

class LicitacionResponse(LicitacionBase):
    id: UUID
    usuario_creador: Optional[UUID]
    created_at: datetime
    updated_at: Optional[datetime]
    dias_restantes: Optional[int] = None
    semaforo: Optional[str] = None
    empresa_nombre: Optional[str] = None

    class Config:
        from_attributes = True

# ============================================
# REQUISITOS CHECKLIST
# ============================================
class RequisitoBase(BaseModel):
    licitacion_id: UUID
    nombre: str = Field(..., max_length=500)
    descripcion_original: Optional[str] = None
    tipo: str
    estado: Optional[str] = "pendiente"
    requisito_especifico: Optional[dict] = None
    cumple_validacion: Optional[bool] = None
    valor_solicitado: Optional[str] = Field(None, max_length=200)
    valor_calculado: Optional[str] = Field(None, max_length=200)
    documento_id: Optional[UUID] = None
    obligatorio: Optional[bool] = True
    orden: Optional[int] = 0
    creado_por_ia: Optional[bool] = True

class RequisitoCreate(RequisitoBase):
    pass

class RequisitoUpdate(BaseModel):
    estado: Optional[str] = None
    cumple_validacion: Optional[bool] = None
    valor_calculado: Optional[str] = Field(None, max_length=200)
    documento_id: Optional[UUID] = None

class RequisitoResponse(RequisitoBase):
    id: UUID
    documento_nombre: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# ============================================
# HISTORIAL DE ESTADOS
# ============================================
class HistorialEstadoBase(BaseModel):
    licitacion_id: UUID
    estado_anterior: Optional[str] = None
    estado_nuevo: str
    comentario: Optional[str] = None
    usuario_id: Optional[UUID] = None

class HistorialEstadoResponse(HistorialEstadoBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================
# ESTADÍSTICAS
# ============================================
class DashboardResumen(BaseModel):
    total_licitaciones: int
    activas: int
    proximas_cerrar: int
    adjudicadas: int
    valor_adjudicado: Decimal
    docs_por_vencer: int
    documentos_vencer: int = 0
    perdidas: int = 0
    en_preparacion: int = 0
    total_empresas: int = 0
    total_usuarios: int = 0
    tasa_exito: float = 0
    contratos_activos: int = 0
    total_contratos: int = 0
    contratos_por_vencer: int = 0
    licitaciones_por_empresa: Dict[str, int] = Field(default_factory=dict)
    distribucion_estados: Dict[str, int] = Field(default_factory=dict)

class ProximoCierre(BaseModel):
    id: UUID
    entidad: str
    objeto: str
    fecha_cierre: datetime
    dias_restantes: int
    estado: str
    empresa_id: Optional[UUID] = None
    empresa_nombre: Optional[str] = None

# ============================================
# CHECKLIST MANUAL (checkbox + responsable) Y SUBSANACION
# ============================================
class ChecklistItemUpdate(BaseModel):
    cumplido: bool
    documento_id: Optional[UUID] = None

class SubsanacionUpdate(BaseModel):
    notas: Optional[str] = None

class ChecklistActividadItem(BaseModel):
    item_key: str
    item_nombre: Optional[str] = None
    cumplido: bool
    validado_por: Optional[UUID] = None
    validado_por_nombre: Optional[str] = None
    validado_en: Optional[datetime] = None

# ============================================
# SEMAFORO DE ALERTAS
# ============================================
class ConfiguracionAlertasResponse(BaseModel):
    dias_rojo: int
    dias_naranja: int

class ConfiguracionAlertasUpdate(BaseModel):
    dias_rojo: int = Field(..., ge=0)
    dias_naranja: int = Field(..., ge=0)

class SemaforoLicitacionItem(BaseModel):
    id: UUID
    numero_secop: Optional[str] = None
    entidad_contratante: Optional[str] = None
    estado: Optional[str] = None
    semaforo: str
    dias_restantes: Optional[int] = None
    empresa_id: Optional[UUID] = None
    empresa_nombre: Optional[str] = None

class SemaforoResumen(BaseModel):
    rojo: int = 0
    naranja: int = 0
    verde: int = 0
    detalle: List[SemaforoLicitacionItem] = Field(default_factory=list)

# ============================================
# MENSAJES
# ============================================
class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
