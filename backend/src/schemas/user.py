from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

# --- BASE ---
class UserBase(BaseModel):
    email: EmailStr
    nombre: str = Field(..., min_length=2, max_length=150)
    apellido: str = Field(..., min_length=2, max_length=150)
    telefono: Optional[str] = Field(None, max_length=20)
    cargo: Optional[str] = Field(None, max_length=100)

# --- CREATE ---
class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=72)
    roles_ids: List[UUID] = Field(default_factory=list)

# --- UPDATE ---
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    nombre: Optional[str] = Field(None, min_length=2, max_length=150)
    apellido: Optional[str] = Field(None, min_length=2, max_length=150)
    telefono: Optional[str] = Field(None, max_length=20)
    cargo: Optional[str] = Field(None, max_length=100)
    activo: Optional[bool] = None

class UserChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=72)

class UserPasswordReset(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=72)


class PermisoItem(BaseModel):
    key: str
    otorgado: bool


class PermisoUpdateRequest(BaseModel):
    permisos: List[PermisoItem]


class PermisoStatus(BaseModel):
    key: str
    label: str
    modulo: str
    otorgado: bool
    por_defecto: bool
    sobreescrito: bool

# --- LOGIN ---
class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRoleAssign(BaseModel):
    rol_id: UUID


class UserEmpresaAssign(BaseModel):
    rol_id: UUID
    
# --- ROL RESPONSE ---
class RolResponse(BaseModel):
    id: UUID
    nombre: str
    descripcion: Optional[str] = None

    class Config:
        from_attributes = True

# --- EMPRESA RESPONSE in User context ---
class UserEmpresaResponse(BaseModel):
    id: UUID
    nombre: str
    nit: str
    logo_url: Optional[str] = None
    activo: bool

    class Config:
        from_attributes = True

# --- USUARIO-EMPRESA-ROL ---
class UsuarioEmpresaRol(BaseModel):
    empresa: UserEmpresaResponse
    rol: RolResponse

    class Config:
        from_attributes = True

# --- RESPONSE ---
class UserResponse(UserBase):
    id: UUID
    activo: bool
    ultimo_acceso: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]
    global_roles: List[RolResponse] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    empresas: List[UsuarioEmpresaRol] = Field(default_factory=list)
    permisos: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True

# --- TOKEN ---
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    roles: List[str] = Field(default_factory=list)
    empresas: List[UUID] = Field(default_factory=list)

# --- EMPRESA RESPONSE ---
class EmpresaResponse(BaseModel):
    id: UUID
    nombre: str
    nit: str
    email: Optional[str]
    activo: bool

    class Config:
        from_attributes = True

# --- MENSAJES ---
class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
