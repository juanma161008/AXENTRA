from typing import Any, Dict, Optional, List
from fastapi.responses import JSONResponse
from fastapi import status

def success_response(
    data: Any = None,
    message: str = "Operación exitosa",
    status_code: int = status.HTTP_200_OK,
    meta: Optional[Dict] = None
) -> Dict:
    """Respuesta de éxito estandarizada"""
    response = {
        "success": True,
        "message": message,
        "data": data
    }
    if meta:
        response["meta"] = meta
    return response

def error_response(
    message: str = "Error en la operación",
    status_code: int = status.HTTP_400_BAD_REQUEST,
    errors: Optional[List[Dict]] = None
) -> Dict:
    """Respuesta de error estandarizada"""
    response = {
        "success": False,
        "message": message
    }
    if errors:
        response["errors"] = errors
    return JSONResponse(
        status_code=status_code,
        content=response
    )

def paginated_response(
    data: List[Any],
    total: int,
    page: int = 1,
    limit: int = 100
) -> Dict:
    """Respuesta paginada"""
    return {
        "success": True,
        "data": data,
        "meta": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    }