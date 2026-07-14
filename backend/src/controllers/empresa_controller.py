from sqlalchemy.orm import Session
from fastapi import HTTPException, status, Depends
from typing import List, Optional
import uuid

from src.models.user import User
from src.models.empresa import Empresa
from src.models.usuario_empresa import UsuarioEmpresa
from src.models.licitacion import Licitacion
from src.schemas.empresa import EmpresaCreate, EmpresaUpdate
from src.utils.constants import MENSAJES
from src.auth.auth import get_current_user

ADMIN_ROLES = {"super_admin", "admin_empresa"}


def _extract_empresa_id(item):
    if item is None:
        return None

    if isinstance(item, dict):
        if item.get("id"):
            return item.get("id")
        empresa = item.get("empresa")
        if isinstance(empresa, dict):
            return empresa.get("id")

    empresa = getattr(item, "empresa", None)
    if empresa is not None:
        empresa_id = getattr(empresa, "id", None)
        if empresa_id:
            return empresa_id

    return getattr(item, "id", None)


class EmpresaController:
    @staticmethod
    def get_empresas(
        db: Session,
        current_user: User = Depends(get_current_user),
        skip: int = 0,
        limit: int = 100,
        activo: Optional[bool] = None,
        nit: Optional[str] = None,
    ):
        """Listar empresas basado en rol de usuario"""
        query = db.query(Empresa)

        # Los administradores ven todas las empresas; el resto solo las asignadas.
        if not bool(set(getattr(current_user, "roles", []) or []).intersection(ADMIN_ROLES)):
            user_empresa_ids = []
            for empresa in getattr(current_user, "empresas", []) or []:
                empresa_id = _extract_empresa_id(empresa)
                if empresa_id:
                    user_empresa_ids.append(empresa_id)
            if not user_empresa_ids:
                return []
            query = query.filter(Empresa.id.in_(user_empresa_ids))

        if activo is not None:
            query = query.filter(Empresa.activo == activo)

        if nit:
            query = query.filter(Empresa.nit == nit)

        return query.offset(skip).limit(limit).all()

    @staticmethod
    def get_empresa(empresa_id: uuid.UUID, db: Session):
        """Obtener empresa por ID"""
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada"
            )
        return empresa

    @staticmethod
    def create_empresa(empresa_data: EmpresaCreate, db: Session):
        """Crear empresa"""
        existing = db.query(Empresa).filter(Empresa.nit == empresa_data.nit).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El NIT ya está registrado"
            )
        
        new_empresa = Empresa(
            id=uuid.uuid4(),
            **empresa_data.model_dump(),
            activo=True
        )
        
        db.add(new_empresa)
        db.commit()
        db.refresh(new_empresa)
        
        return new_empresa

    @staticmethod
    def update_empresa(empresa_id: uuid.UUID, empresa_data: EmpresaUpdate, db: Session):
        """Actualizar empresa"""
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada"
            )
        
        if empresa_data.nit and empresa_data.nit != empresa.nit:
            existing = db.query(Empresa).filter(Empresa.nit == empresa_data.nit).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El NIT ya está registrado por otra empresa"
                )
        
        update_data = empresa_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(empresa, key, value)
        
        db.commit()
        db.refresh(empresa)
        
        return empresa

    @staticmethod
    def delete_empresa(empresa_id: uuid.UUID, db: Session):
        """Eliminar empresa (borrado real)."""
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )

        # Nota: No implementamos borrado en cascada a nivel DB aquí; eliminamos la empresa.
        # Si existen referencias, la operación podría fallar dependiendo de las FK del esquema.
        db.delete(empresa)
        db.commit()

        return {"message": MENSAJES["EMPRESA_ELIMINADA"]}

    @staticmethod
    def get_usuarios_empresa(empresa_id: uuid.UUID, db: Session):
        """Obtener usuarios de una empresa"""
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada"
            )
        
        usuarios = db.query(UsuarioEmpresa).filter(
            UsuarioEmpresa.empresa_id == empresa_id,
            UsuarioEmpresa.activo == True
        ).all()
        
        return usuarios

    @staticmethod
    def get_estadisticas_empresa(empresa_id: uuid.UUID, db: Session):
        """Obtener estadísticas de una empresa"""
        from sqlalchemy import func
        
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada"
            )
        
        stats = db.query(
            Licitacion.estado,
            func.count(Licitacion.id).label('total')
        ).filter(Licitacion.empresa_id == empresa_id).group_by(Licitacion.estado).all()
        
        total_usuarios = db.query(UsuarioEmpresa).filter(
            UsuarioEmpresa.empresa_id == empresa_id,
            UsuarioEmpresa.activo == True
        ).count()
        
        return {
            "empresa_id": empresa_id,
            "nombre": empresa.nombre,
            "total_usuarios": total_usuarios,
            "licitaciones_por_estado": [{"estado": s[0], "total": s[1]} for s in stats]
        }
