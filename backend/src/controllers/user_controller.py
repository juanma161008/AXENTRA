from typing import Optional
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.auth.auth import get_password_hash
from src.models.empresa import Empresa
from src.models.rol import Rol
from src.models.user import User
from src.models.usuario_empresa import UsuarioEmpresa
from src.models.usuario_rol import UsuarioRol
from src.models.usuario_permiso import UsuarioPermiso
from src.schemas.empresa import EmpresaResponse
from src.schemas.user import (
    RolResponse,
    UserCreate,
    UserEmpresaResponse,
    UserResponse,
    UserUpdate,
    UsuarioEmpresaRol,
)
from src.utils.constants import MENSAJES
from src.utils.permissions import effective_permissions, load_overrides


class UserController:
    @staticmethod
    def _build_user_response(user: User, db: Session):
        user_global_roles = (
            db.query(Rol)
            .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
            .filter(UsuarioRol.usuario_id == user.id)
            .all()
        )

        user_empresas_data = (
            db.query(UsuarioEmpresa, Rol, Empresa)
            .join(Rol, Rol.id == UsuarioEmpresa.rol_id)
            .join(Empresa, Empresa.id == UsuarioEmpresa.empresa_id)
            .filter(
                UsuarioEmpresa.usuario_id == user.id,
                UsuarioEmpresa.activo == True,  # noqa: E712
                Empresa.activo == True,  # noqa: E712
            )
            .all()
        )

        empresas_roles = [
            UsuarioEmpresaRol(
                empresa=UserEmpresaResponse.from_orm(empresa),
                rol=RolResponse.from_orm(rol),
            )
            for _, rol, empresa in user_empresas_data
        ]

        global_roles = [RolResponse.from_orm(rol) for rol in user_global_roles]
        roles = [rol.nombre for rol in user_global_roles]
        for _, rol, _ in user_empresas_data:
            if rol.nombre not in roles:
                roles.append(rol.nombre)

        overrides = load_overrides(user.id, db)
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
    def _ensure_admin_user(current_user: User) -> None:
        admin_roles = {"super_admin", "admin_empresa"}
        if not bool(set(getattr(current_user, "roles", []) or []).intersection(admin_roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta accion",
            )

    @staticmethod
    def _ensure_role_exists(role_id: uuid.UUID, db: Session) -> Rol:
        role = db.query(Rol).filter(Rol.id == role_id).first()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rol no encontrado",
            )
        return role

    @staticmethod
    def _ensure_company_exists(company_id: uuid.UUID, db: Session) -> Empresa:
        empresa = db.query(Empresa).filter(Empresa.id == company_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        return empresa

    @staticmethod
    def _ensure_user_exists(user_id: uuid.UUID, db: Session) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        return user

    @staticmethod
    def _upsert_user_roles(user_id: uuid.UUID, roles_ids, db: Session):
        normalized_roles = []
        for role_id in roles_ids or []:
            try:
                normalized_roles.append(uuid.UUID(str(role_id)))
            except (TypeError, ValueError):
                continue

        if not normalized_roles:
            return

        existing_roles = {
            str(rol_id)
            for (rol_id,) in db.query(UsuarioRol.rol_id).filter(UsuarioRol.usuario_id == user_id).all()
        }

        roles_to_add = [role_id for role_id in normalized_roles if str(role_id) not in existing_roles]
        if not roles_to_add:
            return

        roles = db.query(Rol).filter(Rol.id.in_(roles_to_add)).all()
        found_ids = {str(role.id) for role in roles}
        missing = [str(role_id) for role_id in roles_to_add if str(role_id) not in found_ids]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uno o mas roles no existen",
            )

        for role in roles:
            db.add(UsuarioRol(usuario_id=user_id, rol_id=role.id))

    @staticmethod
    def get_users(db: Session, skip: int = 0, limit: int = 100, activo: Optional[bool] = None):
        """Listar usuarios."""
        query = db.query(User)
        if activo is not None:
            query = query.filter(User.activo == activo)
        users = query.offset(skip).limit(limit).all()
        return [UserController._build_user_response(user, db) for user in users]

    @staticmethod
    def get_user(user_id: uuid.UUID, db: Session):
        """Obtener usuario por ID."""
        user = UserController._ensure_user_exists(user_id, db)
        return UserController._build_user_response(user, db)

    @staticmethod
    def create_user(user_data: UserCreate, db: Session):
        """Crear usuario."""
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
        db.flush()
        UserController._upsert_user_roles(new_user.id, getattr(user_data, "roles_ids", []), db)
        db.commit()
        db.refresh(new_user)

        return UserController._build_user_response(new_user, db)

    @staticmethod
    def update_user(user_id: uuid.UUID, user_data: UserUpdate, current_user: User, db: Session):
        """Actualizar usuario."""
        user = UserController._ensure_user_exists(user_id, db)

        admin_roles = {"super_admin", "admin_empresa"}
        is_admin = bool(set(getattr(current_user, "roles", []) or []).intersection(admin_roles))
        if current_user.id != user_id and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para actualizar este usuario",
            )

        update_data = user_data.model_dump(exclude_unset=True)
        if "email" in update_data and update_data["email"] and update_data["email"] != user.email:
            existing = db.query(User).filter(User.email == update_data["email"]).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El email ya esta registrado",
                )

        for key, value in update_data.items():
            setattr(user, key, value)

        db.commit()
        db.refresh(user)

        return UserController._build_user_response(user, db)

    @staticmethod
    def delete_user(user_id: uuid.UUID, current_user: User, db: Session):
        """Eliminar usuario (borrado real)."""
        user = UserController._ensure_user_exists(user_id, db)

        admin_roles = {"super_admin", "admin_empresa"}
        is_admin = bool(set(getattr(current_user, "roles", []) or []).intersection(admin_roles))
        if current_user.id != user_id and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para eliminar este usuario",
            )

        db.delete(user)
        db.commit()

        return {"message": MENSAJES["USUARIO_ELIMINADO"]}

    @staticmethod
    def get_permisos(user_id: uuid.UUID, db: Session):
        """Catalogo completo + estado efectivo de permisos para un usuario."""
        from src.utils.permissions import PERMISSIONS, default_permissions_for_roles

        user = UserController._ensure_user_exists(user_id, db)
        roles = [rol.nombre for rol in db.query(Rol).join(UsuarioRol, UsuarioRol.rol_id == Rol.id).filter(UsuarioRol.usuario_id == user_id).all()]
        overrides = {row.permiso_key: row.otorgado for row in db.query(UsuarioPermiso).filter(UsuarioPermiso.usuario_id == user_id).all()}
        defaults = default_permissions_for_roles(roles)

        result = []
        for key, meta in PERMISSIONS.items():
            otorgado = overrides[key] if key in overrides else key in defaults
            result.append(
                {
                    "key": key,
                    "label": meta["label"],
                    "modulo": meta["modulo"],
                    "otorgado": otorgado,
                    "por_defecto": key in defaults,
                    "sobreescrito": key in overrides,
                }
            )
        return result

    @staticmethod
    def set_permisos(user_id: uuid.UUID, permisos: list, db: Session):
        """Otorga/revoca permisos puntuales para un usuario (upsert)."""
        UserController._ensure_user_exists(user_id, db)

        for item in permisos:
            key = item.get("key") if isinstance(item, dict) else item.key
            otorgado = item.get("otorgado") if isinstance(item, dict) else item.otorgado

            existing = (
                db.query(UsuarioPermiso)
                .filter(UsuarioPermiso.usuario_id == user_id, UsuarioPermiso.permiso_key == key)
                .first()
            )
            if existing:
                existing.otorgado = otorgado
            else:
                db.add(UsuarioPermiso(id=uuid.uuid4(), usuario_id=user_id, permiso_key=key, otorgado=otorgado))

        db.commit()
        return UserController.get_permisos(user_id, db)

    @staticmethod
    def reset_password(user_id: uuid.UUID, new_password: str, db: Session):
        """Restablecer la contrasena de un usuario (accion de administrador)."""
        user = UserController._ensure_user_exists(user_id, db)
        user.password_hash = get_password_hash(new_password)
        db.commit()
        return {"message": "Contrasena restablecida correctamente"}

    @staticmethod
    def get_user_empresas(user_id: uuid.UUID, db: Session):
        """Obtener empresas del usuario."""
        empresas = (
            db.query(Empresa)
            .join(UsuarioEmpresa, Empresa.id == UsuarioEmpresa.empresa_id)
            .filter(
                UsuarioEmpresa.usuario_id == user_id,
                UsuarioEmpresa.activo == True,  # noqa: E712
                Empresa.activo == True,  # noqa: E712
            )
            .all()
        )

        return empresas

    @staticmethod
    def assign_role_to_user(user_id: uuid.UUID, rol_id: uuid.UUID, db: Session):
        """Asignar un rol global a un usuario."""
        user = UserController._ensure_user_exists(user_id, db)
        role = UserController._ensure_role_exists(rol_id, db)

        existing = (
            db.query(UsuarioRol)
            .filter(UsuarioRol.usuario_id == user_id, UsuarioRol.rol_id == role.id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El usuario ya tiene este rol",
            )

        db.add(UsuarioRol(usuario_id=user_id, rol_id=role.id))
        db.commit()
        db.refresh(user)
        return UserController._build_user_response(user, db)

    @staticmethod
    def remove_role_from_user(user_id: uuid.UUID, rol_id: uuid.UUID, db: Session):
        """Quitar un rol global a un usuario."""
        user = UserController._ensure_user_exists(user_id, db)
        role = UserController._ensure_role_exists(rol_id, db)

        existing = (
            db.query(UsuarioRol)
            .filter(UsuarioRol.usuario_id == user_id, UsuarioRol.rol_id == role.id)
            .first()
        )
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El usuario no tiene este rol",
            )

        db.delete(existing)
        db.commit()
        db.refresh(user)
        return UserController._build_user_response(user, db)

    @staticmethod
    def upsert_user_empresa(user_id: uuid.UUID, empresa_id: uuid.UUID, rol_id: uuid.UUID, db: Session):
        """Asignar o actualizar la relacion usuario-empresa."""
        user = UserController._ensure_user_exists(user_id, db)
        empresa = UserController._ensure_company_exists(empresa_id, db)
        role = UserController._ensure_role_exists(rol_id, db)

        existing = (
            db.query(UsuarioEmpresa)
            .filter(
                UsuarioEmpresa.usuario_id == user_id,
                UsuarioEmpresa.empresa_id == empresa.id,
            )
            .first()
        )

        if existing:
            existing.rol_id = role.id
            existing.activo = True
        else:
            existing = UsuarioEmpresa(
                id=uuid.uuid4(),
                usuario_id=user_id,
                empresa_id=empresa.id,
                rol_id=role.id,
                activo=True,
            )
            db.add(existing)

        db.commit()
        db.refresh(user)
        return UserController._build_user_response(user, db)

    @staticmethod
    def remove_user_empresa(user_id: uuid.UUID, empresa_id: uuid.UUID, db: Session):
        """Desactivar la asignacion de una empresa a un usuario."""
        user = UserController._ensure_user_exists(user_id, db)
        UserController._ensure_company_exists(empresa_id, db)

        existing = (
            db.query(UsuarioEmpresa)
            .filter(
                UsuarioEmpresa.usuario_id == user_id,
                UsuarioEmpresa.empresa_id == empresa_id,
            )
            .first()
        )

        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El usuario no tiene asignada esta empresa",
            )

        existing.activo = False
        db.commit()
        db.refresh(user)
        return UserController._build_user_response(user, db)
