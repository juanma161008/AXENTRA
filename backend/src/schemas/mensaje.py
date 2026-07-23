from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class MensajeCreate(BaseModel):
    destinatario_id: UUID
    asunto: Optional[str] = Field(None, max_length=255)
    cuerpo: str = Field(..., min_length=1)


class MensajeResponse(BaseModel):
    id: UUID
    remitente_id: Optional[UUID] = None
    remitente_nombre: Optional[str] = None
    destinatario_id: UUID
    destinatario_nombre: Optional[str] = None
    asunto: Optional[str] = None
    cuerpo: str
    tipo: str = "mensaje"
    leido: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ContactoResponse(BaseModel):
    id: UUID
    nombre: str
    email: str
