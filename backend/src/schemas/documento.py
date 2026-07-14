from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

# ============================================
# CARPETA
# ============================================
class CarpetaBase(BaseModel):
    empresa_id: UUID
    nombre: str = Field(..., min_length=1, max_length=255)
    descripcion: Optional[str] = None
    icono: Optional[str] = Field("folder", max_length=50)
    color: Optional[str] = Field("#3b82f6", max_length=20)

class CarpetaCreate(CarpetaBase):
    carpeta_padre_id: Optional[UUID] = None
    licitacion_id: Optional[UUID] = None

class CarpetaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=255)
    descripcion: Optional[str] = None
    icono: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)

class CarpetaResponse(CarpetaBase):
    id: UUID
    carpeta_padre_id: Optional[UUID]
    licitacion_id: Optional[UUID] = None
    licitacion_numero: Optional[str] = None
    licitacion_entidad: Optional[str] = None
    total_documentos: Optional[int] = 0
    created_at: datetime
    updated_at: Optional[datetime]
    subcarpetas: Optional[List['CarpetaResponse']] = None

    class Config:
        from_attributes = True

# ============================================
# DOCUMENTO
# ============================================
class DocumentoBase(BaseModel):
    carpeta_id: Optional[UUID] = None
    empresa_id: UUID
    nombre: str = Field(..., min_length=1, max_length=255)
    nombre_original: Optional[str] = Field(None, max_length=500)
    tipo_documento: Optional[str] = Field(None, max_length=100)
    descripcion: Optional[str] = None
    ruta_archivo: str
    tamanio_bytes: Optional[int] = None
    formato: Optional[str] = Field(None, max_length=10)
    version: Optional[str] = "1.0"
    vigente: Optional[bool] = True
    fecha_vencimiento: Optional[datetime] = None
    tags: Optional[str] = None
    meta_data: Optional[Dict[str, Any]] = Field(None, alias="metadata")
    usuario_subida: Optional[UUID] = None

    class Config:
        populate_by_name = True

class DocumentoCreate(DocumentoBase):
    pass

class DocumentoUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=255)
    tipo_documento: Optional[str] = Field(None, max_length=100)
    descripcion: Optional[str] = None
    vigente: Optional[bool] = None
    fecha_vencimiento: Optional[datetime] = None
    tags: Optional[str] = None
    meta_data: Optional[Dict[str, Any]] = Field(None, alias="metadata")

    class Config:
        populate_by_name = True

class DocumentoResponse(DocumentoBase):
    id: UUID
    carpeta_nombre: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
        populate_by_name = True

# ============================================
# VERSIÓN DE DOCUMENTO
# ============================================
class VersionDocumentoBase(BaseModel):
    documento_id: UUID
    version: str
    ruta_archivo: str
    tamanio_bytes: Optional[int] = None
    cambios: Optional[str] = None
    usuario_id: Optional[UUID] = None

class VersionDocumentoResponse(VersionDocumentoBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================
# ÁRBOL DE CARPETAS
# ============================================
class NodoCarpeta(BaseModel):
    id: UUID
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    nivel: int
    ruta: str
    hijos: Optional[List['NodoCarpeta']] = None

# ============================================
# DOCUMENTOS POR VENCER
# ============================================
class DocumentoPorVencer(BaseModel):
    id: UUID
    nombre: str
    tipo_documento: Optional[str] = None
    fecha_vencimiento: datetime
    empresa: str
    dias_restantes: int
    estado: str  # 'vencido', 'por_vencer', 'proximo', 'vigente'

# ============================================
# MENSAJES
# ============================================
class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
