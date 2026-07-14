from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID

# ============================================
# BASE
# ============================================
class EmpresaBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=255)
    nit: str = Field(..., min_length=5, max_length=20)
    direccion: Optional[str] = None
    telefono: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    sitio_web: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = None

# ============================================
# CREATE
# ============================================
class EmpresaCreate(EmpresaBase):
    grupo_empresarial_id: Optional[UUID] = None

# ============================================
# UPDATE
# ============================================
class EmpresaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=255)
    nit: Optional[str] = Field(None, min_length=5, max_length=20)
    direccion: Optional[str] = None
    telefono: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    sitio_web: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = None
    activo: Optional[bool] = None

# ============================================
# RESPONSE
# ============================================
class EmpresaResponse(EmpresaBase):
    id: UUID
    grupo_empresarial_id: Optional[UUID]
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# ============================================
# GRUPO EMPRESARIAL
# ============================================
class GrupoEmpresarialBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=255)
    nit: Optional[str] = Field(None, max_length=20)
    descripcion: Optional[str] = None
    logo_url: Optional[str] = None

class GrupoEmpresarialCreate(GrupoEmpresarialBase):
    pass

class GrupoEmpresarialResponse(GrupoEmpresarialBase):
    id: UUID
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# ============================================
# ASIGNAR USUARIO A EMPRESA
# ============================================
class UsuarioEmpresaCreate(BaseModel):
    usuario_id: UUID
    empresa_id: UUID
    rol_id: UUID

class UsuarioEmpresaResponse(BaseModel):
    id: UUID
    usuario_id: UUID
    empresa_id: UUID
    rol_id: UUID
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================
# MENSAJES
# ============================================
class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None