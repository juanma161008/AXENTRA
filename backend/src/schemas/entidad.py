from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class EntidadBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=255)
    nit: str = Field(..., min_length=3, max_length=20)
    tipo: Optional[str] = Field(None, max_length=100)
    direccion: Optional[str] = None
    telefono: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    sitio_web: Optional[str] = Field(None, max_length=255)


class EntidadCreate(EntidadBase):
    pass


class EntidadUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=255)
    nit: Optional[str] = Field(None, min_length=3, max_length=20)
    tipo: Optional[str] = Field(None, max_length=100)
    direccion: Optional[str] = None
    telefono: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    sitio_web: Optional[str] = Field(None, max_length=255)
    activo: Optional[bool] = None


class EntidadResponse(EntidadBase):
    id: UUID
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
