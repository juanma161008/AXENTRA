from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from src.config.database import SessionLocal
from src.models.licitacion import Licitacion
from src.models.documento import Documento
from src.models.auditoria import LogActividad

def check_expiring_documents():
    """Verificar documentos por vencer"""
    db = SessionLocal()
    try:
        # Documentos que vencen en los próximos 7 días
        fecha_limite = datetime.now() + timedelta(days=7)
        
        docs = db.query(Documento).filter(
            Documento.vigente == True,
            Documento.fecha_vencimiento.isnot(None),
            Documento.fecha_vencimiento <= fecha_limite,
            Documento.fecha_vencimiento >= datetime.now()
        ).all()
        
        return {
            "total": len(docs),
            "documentos": [
                {"id": str(d.id), "nombre": d.nombre, "fecha_vencimiento": d.fecha_vencimiento}
                for d in docs
            ]
        }
    finally:
        db.close()

def update_licitacion_status():
    """Actualizar estados de licitaciones automáticamente"""
    db = SessionLocal()
    try:
        # Licitaciones cuyo fecha_cierre ya pasó
        hoy = datetime.now()
        
        # Cambiar de 'en_busqueda' a 'presentada' si ya pasó la fecha
        licitaciones = db.query(Licitacion).filter(
            Licitacion.estado.in_(["en_busqueda", "en_preparacion"]),
            Licitacion.fecha_cierre < hoy
        ).all()
        
        for lic in licitaciones:
            lic.estado = "presentada"
        
        db.commit()
        return {"actualizadas": len(licitaciones)}
    finally:
        db.close()

def cleanup_logs():
    """Limpiar logs antiguos (más de 90 días)"""
    db = SessionLocal()
    try:
        fecha_limite = datetime.now() - timedelta(days=90)
        deleted = db.query(LogActividad).filter(
            LogActividad.created_at < fecha_limite
        ).delete()
        db.commit()
        return {"eliminados": deleted}
    finally:
        db.close()