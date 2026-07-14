from typing import List, TypeVar, Generic, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Query

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    limit: int
    pages: int
    has_next: bool
    has_prev: bool

def paginate(query: Query, page: int = 1, limit: int = 20) -> PaginatedResponse:
    """Paginación para consultas SQLAlchemy"""
    if page < 1:
        page = 1
    if limit < 1:
        limit = 20
    if limit > 100:
        limit = 100
    
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=(total + limit - 1) // limit if total > 0 else 0,
        has_next=page * limit < total,
        has_prev=page > 1
    )