from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.auth.auth import get_current_user
from src.models.user import User
from src.services.secop_service import SecopConsultaError, buscar_procesos_secop

router = APIRouter(prefix="/api/secop", tags=["secop"])


@router.get("/buscar")
def buscar_secop(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
) -> Dict[str, List[Dict[str, Any]]]:
    """Busca procesos de contratacion publica en el dataset abierto de SECOP II
    (datos.gov.co) por texto libre: numero de proceso, entidad, NIT, objeto, etc."""
    try:
        resultados = buscar_procesos_secop(q, limit)
    except SecopConsultaError:
        # Distinto de "0 resultados": aca no se pudo ni consultar datos.gov.co (red,
        # timeout, servicio caido), asi que se le avisa al usuario en vez de mostrarle
        # una busqueda vacia que parece decir "ese proceso no existe".
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No fue posible conectarse a datos.gov.co en este momento. Intenta de nuevo en un momento.",
        )

    return {"resultados": resultados}
