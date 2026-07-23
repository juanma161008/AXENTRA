from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect
import os
from dotenv import load_dotenv

# Importar rutas
from src.routes import auth, users, empresas, entidades, licitaciones, documentos, roles, secop, oportunidades, mensajes

# Importar middleware y mejoras
from src.middleware.audit import AuditMiddleware
from src.middleware.rate_limit import rate_limiter
from src.sockets.notifications import manager
from src.utils.pagination import paginate

# Cargar variables de entorno
load_dotenv()

# Crear aplicación
app = FastAPI(
    title="AXENTRA API",
    description="API con PostgreSQL, JWT, Auditoría, Notificaciones y más",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# ============================================
# MIDDLEWARE
# ============================================

def _parse_origin_list(raw_value):
    if not raw_value:
        return []

    return [item.strip() for item in raw_value.split(",") if item.strip()]


dev_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:5173",
    "http://[::1]:5174",
    "http://[::1]:5175",
]

configured_origins = _parse_origin_list(os.getenv("CORS_ALLOW_ORIGINS"))
frontend_origin = os.getenv("FRONTEND_URL")
if frontend_origin:
    configured_origins.append(frontend_origin.strip())

allowed_origins = list(dict.fromkeys([*dev_origins, *configured_origins]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Auditoría
app.add_middleware(AuditMiddleware)

# Archivos subidos: la carpeta se mantiene, pero se sirven solo via
# GET /api/documentos/{id}/archivo (con control de acceso), no como estatico publico.
os.makedirs("uploads", exist_ok=True)

# ============================================
# RUTAS
# ============================================

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(empresas.router)
app.include_router(entidades.router)
app.include_router(roles.router)
app.include_router(licitaciones.router)
app.include_router(documentos.router)
app.include_router(secop.router)
app.include_router(oportunidades.router)
app.include_router(mensajes.router)

# ============================================
# WEBSOCKETS
# ============================================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Procesar mensajes del cliente si es necesario
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ============================================
# ENDPOINTS GENERALES
# ============================================

@app.get("/")
def root():
    return {
        "mensaje": "¡API AXENTRA funcionando! 🚀",
        "version": "2.0.0",
        "endpoints": {
            "auth": "/api/auth",
            "users": "/api/users",
            "empresas": "/api/empresas",
            "roles": "/api/roles",
            "licitaciones": "/api/licitaciones",
            "documentos": "/api/documentos",
            "docs": "/docs",
            "redoc": "/redoc",
            "health": "/api/health",
            "websocket": "/ws/{user_id}"
        }
    }

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "mensaje": "Servidor funcionando correctamente",
        "timestamp": __import__("datetime").datetime.now().isoformat(),
        "version": "2.0.0"
    }

# ============================================
# EJECUCIÓN DEL SERVIDOR
# ============================================

if __name__ == "__main__":
    import uvicorn

    # El auto-reload de uvicorn corre el worker real en un subproceso aparte
    # (traspasando el socket ya escuchando). En algunos entornos ese traspaso
    # queda roto: el proceso arranca y responde a la primera, pero las
    # conexiones siguientes se resetean solas sin que el proceso se caiga.
    # Por eso queda apagado por defecto; se puede reactivar con RELOAD=true
    # en .env si en tu maquina no da ese problema.
    reload_enabled = os.getenv("RELOAD", "false").strip().lower() in ("1", "true", "yes")

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", 8001)),
        reload=reload_enabled,
        reload_dirs=[os.path.join(os.path.dirname(__file__), "src")] if reload_enabled else None,
        reload_includes=["main.py"] if reload_enabled else None,
        reload_excludes=["*.log", "*.txt", "*.zip", "*.env"] if reload_enabled else None,
    )
