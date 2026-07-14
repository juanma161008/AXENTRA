from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
import os
import uuid
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session


from src.config.database import get_db
from src.models.user import User
from src.models.usuario_rol import UsuarioRol
from src.models.usuario_empresa import UsuarioEmpresa
from src.models.usuario_permiso import UsuarioPermiso
from src.models.rol import Rol
from src.models.empresa import Empresa
from src.utils.permissions import effective_permissions

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "axentra-secret-key-2024")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        password_bytes = plain_password.encode('utf-8')
        
        # Ensure hashed_password is bytes
        if isinstance(hashed_password, str):
            hashed_password_bytes = hashed_password.encode('utf-8')
        else:
            hashed_password_bytes = hashed_password

        return bcrypt.checkpw(password_bytes, hashed_password_bytes)
    except Exception as e:
        print(f"Error verificando contrasena: {e}")
        return False

def verify_token(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_password_hash(password: str) -> str:
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    # Frontend envía un token generado por login() con `user_id`.
    # Si el valor viene como string/UUID, normalizamos al tipo UUID esperado por SQLAlchemy.
    user_id = payload.get("user_id")
    if user_id is None:
        raise credentials_exception

    try:
        # Evita mismatch uuid-vs-string que puede provocar que `user` sea None.
        user_uuid = uuid.UUID(str(user_id))
    except Exception:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise credentials_exception

    # Load global roles and active companies
    user_roles = (
        db.query(Rol.nombre)
        .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
        .filter(UsuarioRol.usuario_id == user.id)
        .all()
    )

    user_empresas_roles = (
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

    # Important: match what frontend expects and what backend scoping compares.
    # Keep `user.empresas[].id` as a string to avoid uuid-vs-string mismatches.
    user.empresas = []
    user.roles = [rol_nombre for (rol_nombre,) in user_roles]

    for ue, rol, empresa in user_empresas_roles:
        user.empresas.append(
            {
                "id": str(ue.empresa_id),
                "nombre": empresa.nombre,
                "nit": empresa.nit,
                "logo_url": empresa.logo_url,
                "activo": empresa.activo,
                "rol": rol.nombre,
            }
        )
        if rol.nombre not in user.roles:
            user.roles.append(rol.nombre)

    permiso_rows = (
        db.query(UsuarioPermiso.permiso_key, UsuarioPermiso.otorgado)
        .filter(UsuarioPermiso.usuario_id == user.id)
        .all()
    )
    user.permisos_overrides = {key: otorgado for key, otorgado in permiso_rows}
    user.permisos = sorted(effective_permissions(user.roles, user.permisos_overrides))

    return user


