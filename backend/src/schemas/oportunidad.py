from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class OportunidadCreate(BaseModel):
    # Opcional: un admin sin empresa filtrada puede dejarla sin asignar todavia.
    empresa_id: Optional[UUID] = None
    url_secop: str = Field(..., min_length=1)
    comentario: Optional[str] = None
    fecha_presentacion: Optional[datetime] = None


class OportunidadUpdate(BaseModel):
    estado: Optional[str] = None
    comentario: Optional[str] = None
    fecha_presentacion: Optional[datetime] = None
    empresa_id: Optional[UUID] = None
    licitacion_id: Optional[UUID] = None


class OportunidadResponse(BaseModel):
    id: UUID
    empresa_id: Optional[UUID] = None
    empresa_nombre: Optional[str] = None
    empresa_asignada_por: Optional[UUID] = None
    empresa_asignada_por_nombre: Optional[str] = None
    empresa_asignada_en: Optional[datetime] = None
    url_secop: str
    comentario: Optional[str] = None
    fecha_presentacion: Optional[datetime] = None
    estado: str
    licitacion_id: Optional[UUID] = None
    licitacion_numero_secop: Optional[str] = None
    licitacion_estado: Optional[str] = None
    creado_por: Optional[UUID] = None
    creado_por_nombre: Optional[str] = None
    revisado_por: Optional[UUID] = None
    revisado_por_nombre: Optional[str] = None
    revisado_en: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
