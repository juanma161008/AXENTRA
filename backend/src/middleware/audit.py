from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from src.config.database import SessionLocal
from src.models.auditoria import LogActividad
from src.auth.auth import decode_token
import json

class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Excluir rutas de salud y docs
        excluded_paths = ["/", "/api/health", "/docs", "/openapi.json", "/favicon.ico", "/redoc"]
        if request.url.path in excluded_paths:
            return await call_next(request)
        
        # Obtener usuario del token
        user_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            payload = decode_token(token)
            if payload:
                user_id = payload.get("user_id")
        
        # Procesar request
        response = await call_next(request)
        
        # Solo registrar POST, PUT, DELETE
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            db = SessionLocal()
            try:
                # Leer body si existe
                body = None
                if request.method in ["POST", "PUT", "PATCH"]:
                    try:
                        body = await request.body()
                        if body:
                            try:
                                body = json.loads(body)
                            except:
                                body = str(body)
                    except:
                        pass
                
                log = LogActividad(
                    usuario_id=user_id,
                    accion=f"{request.method} {request.url.path}",
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                    datos_nuevos=body if body else None
                )
                db.add(log)
                db.commit()
            except Exception as e:
                print(f"Error en auditoria: {e}")
            finally:
                db.close()
        
        return response
