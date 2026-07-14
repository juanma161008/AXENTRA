from datetime import datetime
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.auth.auth import create_access_token, get_password_hash, verify_password
from src.models.empresa import Empresa
from src.models.rol import Rol
from src.models.usuario_rol import UsuarioRol
from src.models.usuario_empresa import UsuarioEmpresa
from src.models.user import User
from src.schemas.user import (
    RolResponse,
    UserCreate,
    UserEmpresaResponse,
    UserLogin,
    UserResponse,
    UsuarioEmpresaRol,
)
from src.utils.constants import MENSAJES
from src.utils.permissions import effective_permissions, load_overrides


class AuthController:
    @staticmethod
    def _load_user_relationships(user_id: uuid.UUID, db: Session):
        user_roles = (
            db.query(Rol)
            .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
            .filter(UsuarioRol.usuario_id == user_id)
            .all()
        )

        user_empresas_data = (
            db.query(UsuarioEmpresa, Rol, Empresa)
            .join(Rol, Rol.id == UsuarioEmpresa.rol_id)
            .join(Empresa, Empresa.id == UsuarioEmpresa.empresa_id)
            .filter(
                UsuarioEmpresa.usuario_id == user_id,
                UsuarioEmpresa.activo == True,
                Empresa.activo == True,
            )
            .all()
        )

        empresas_roles = []
        roles = [rol.nombre for rol in user_roles]
        global_roles = [RolResponse.from_orm(rol) for rol in user_roles]

        for _, rol, empresa in user_empresas_data:
            empresas_roles.append(
                UsuarioEmpresaRol(
                    empresa=UserEmpresaResponse.from_orm(empresa),
                    rol=RolResponse.from_orm(rol),
                )
            )
            if rol.nombre not in roles:
                roles.append(rol.nombre)

        return empresas_roles, roles, global_roles

    @staticmethod
    def _build_user_response(user: User, empresas_roles, roles, global_roles, db: Session = None):
        overrides = load_overrides(user.id, db) if db is not None else {}
        return UserResponse(
            id=user.id,
            email=user.email,
            nombre=user.nombre,
            apellido=user.apellido,
            telefono=user.telefono,
            cargo=user.cargo,
            activo=user.activo,
            ultimo_acceso=user.ultimo_acceso,
            created_at=user.created_at,
            updated_at=user.updated_at,
            global_roles=global_roles,
            roles=roles,
            empresas=empresas_roles,
            permisos=sorted(effective_permissions(roles, overrides)),
        )

    @staticmethod
    def login(user_data: UserLogin, db: Session):
        """Iniciar sesion"""
        user = db.query(User).filter(User.email == user_data.email).first()

        if not user or not verify_password(user_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciales incorrectas",
            )

        if not user.activo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario inactivo",
            )

        # Update last access
        user.ultimo_acceso = datetime.now()
        db.commit()

        empresas_roles, roles, global_roles = AuthController._load_user_relationships(user.id, db)

        token_data = {
            "sub": user.email,
            "user_id": str(user.id),
            "nombre": f"{user.nombre} {user.apellido}",
            "roles": roles,
        }
        access_token = create_access_token(token_data)

        user_response = AuthController._build_user_response(user, empresas_roles, roles, global_roles, db)

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response,
        }

    @staticmethod
    def register(user_data: UserCreate, db: Session):
        """Registrar nuevo usuario"""
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El email ya esta registrado",
            )

        new_user = User(
            id=uuid.uuid4(),
            email=user_data.email,
            nombre=user_data.nombre,
            apellido=user_data.apellido,
            telefono=user_data.telefono,
            cargo=user_data.cargo,
            password_hash=get_password_hash(user_data.password),
            activo=True,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return {
            "message": MENSAJES["USUARIO_CREADO"],
            "user": new_user,
        }

    @staticmethod
    def get_current_user(email: str, db: Session):
        """Obtener usuario por email"""
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )

        empresas_roles, roles, global_roles = AuthController._load_user_relationships(user.id, db)
        return AuthController._build_user_response(user, empresas_roles, roles, global_roles, db)

    @staticmethod
    def change_password(user_id: uuid.UUID, current_password: str, new_password: str, db: Session):
        """Cambiar contrasena"""
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )

        if not verify_password(current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Contrasena actual incorrecta",
            )

        user.password_hash = get_password_hash(new_password)
        db.commit()

        return {"message": "Contrasena actualizada correctamente"}
