from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import UUID
from src.config.database import Base
import uuid

class Rol(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "seguridad"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(50), unique=True, nullable=False, index=True)
    descripcion = Column(Text)
