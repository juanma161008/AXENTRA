"""Helper para hard-delete recursivo del árbol documental.

Se usa desde DocumentoController para borrar carpetas (y subcarpetas)
+ documentos asociados y borrar archivos físicos.

Nota: este archivo no es estrictamente necesario; se creó para mantener el controlador
legible y evitar errores por refactors.
"""

from __future__ import annotations

import uuid
from typing import Set

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.models.documento import Carpeta, Documento
from src.utils.file_handlers import FileHandler


def delete_document_file_if_exists(documento: Documento) -> None:
    """Intenta borrar el archivo físico asociado a un documento."""
    try:
        ruta = getattr(documento, "ruta_archivo", None)
        if ruta:
            FileHandler().delete_file(ruta)
    except Exception:
        # Si falla la eliminación física, igual se elimina el registro.
        pass


def collect_folder_and_descendants(
    db: Session,
    empresa_id: uuid.UUID,
    carpeta_id: uuid.UUID,
) -> Set[uuid.UUID]:
    """Recoge IDs de la carpeta y todas sus hijas recursivamente."""
    collected: Set[uuid.UUID] = set()
    stack = [carpeta_id]

    while stack:
        current = stack.pop()
        if current in collected:
            continue

        carpeta = (
            db.query(Carpeta)
            .filter(Carpeta.id == current, Carpeta.empresa_id == empresa_id)
            .first()
        )
        if not carpeta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Carpeta no encontrada",
            )

        collected.add(current)

        children = (
            db.query(Carpeta.id)
            .filter(Carpeta.empresa_id == empresa_id, Carpeta.carpeta_padre_id == current)
            .all()
        )
        for (child_id,) in children:
            if child_id not in collected:
                stack.append(child_id)

    return collected


def delete_folder_tree(db: Session, empresa_id: uuid.UUID, carpeta_id: uuid.UUID) -> None:
    """Hard delete recursivo: carpetas + documentos + borrado físico."""
    carpeta_ids = collect_folder_and_descendants(db, empresa_id, carpeta_id)

    # Borrar documentos dentro de las carpetas encontradas
    documentos = db.query(Documento).filter(Documento.empresa_id == empresa_id, Documento.carpeta_id.in_(carpeta_ids)).all()

    for doc in documentos:
        delete_document_file_if_exists(doc)

    # Borrar carpetas (registros) después de borrar documentos
    for doc in documentos:
        db.delete(doc)

    carpetas = db.query(Carpeta).filter(Carpeta.empresa_id == empresa_id, Carpeta.id.in_(carpeta_ids)).all()
    for carpeta in carpetas:
        db.delete(carpeta)

    db.commit()

