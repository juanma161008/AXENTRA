"""Bootstrap de una base de datos 'axentra' nueva/vacia: crea los schemas de Postgres y
todas las tablas declaradas en los modelos de SQLAlchemy. No hay Alembic en este proyecto,
asi que este script (idempotente) es el unico mecanismo para levantar el esquema completo
en una instalacion nueva de Postgres.

Uso:
    cd backend
    python bootstrap_db.py
"""

from sqlalchemy import text

from src.config.database import Base, engine

SCHEMAS = ["seguridad", "negocio", "licitaciones", "documentos", "auditoria"]

# Importar todos los modulos de modelos para que sus modelos se registren en Base.metadata
# antes de llamar a create_all.
from src.models import (  # noqa: E402,F401
    auditoria,
    documento,
    empresa,
    entidad,
    licitacion,
    rol,
    user,
    usuario_empresa,
    usuario_permiso,
    usuario_rol,
)


def run():
    with engine.begin() as conn:
        for schema in SCHEMAS:
            print(f"Creando schema '{schema}' (si no existe)...")
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))

    print("Creando tablas declaradas en los modelos (si no existen)...")
    Base.metadata.create_all(bind=engine)
    print("\nBootstrap completado correctamente.")


if __name__ == "__main__":
    run()
