from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import timedelta
import os

from src.config.database import get_db
from src.schemas.user import (
    UserLogin, UserResponse, Token, 
    UserChangePassword, MessageResponse,
    UserCreate  # ← IMPORTANTE: agregar UserCreate
)
from src.controllers.auth_controller import AuthController
from src.auth.auth import decode_token, oauth2_scheme

router = APIRouter(prefix="/api/auth", tags=["autenticación"])

# ============================================
# 1. LOGIN
# ============================================
@router.post("/login", response_model=Token)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Iniciar sesión"""
    return AuthController.login(user_data, db)

# ============================================
# 2. REGISTRO
# ============================================
@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Registrar nuevo usuario"""
    result = AuthController.register(user_data, db)
    return {"message": result["message"], "detail": str(result["user"].id)}

# ============================================
# 3. OBTENER USUARIO ACTUAL
# ============================================
@router.get("/me", response_model=UserResponse)
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Obtener información del usuario autenticado"""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido"
        )
    
    email = payload.get("sub")
    return AuthController.get_current_user(email, db)

# ============================================
# 4. CAMBIAR CONTRASEÑA
# ============================================
@router.post("/change-password", response_model=MessageResponse)
def change_password(
    data: UserChangePassword,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Cambiar la contraseña del usuario autenticado"""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido"
        )
    
    user_id = payload.get("user_id")
    result = AuthController.change_password(user_id, data.current_password, data.new_password, db)
    return result

# ============================================
# 5. LOGOUT
# ============================================
@router.post("/logout", response_model=MessageResponse)
def logout(token: str = Depends(oauth2_scheme)):
    """Cerrar sesión (el cliente debe eliminar el token localmente)"""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido"
        )
    
    return {"message": "Sesión cerrada correctamente"}
