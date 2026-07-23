"""Reconcilia el esquema real de Postgres (el .sql "oficial", con FKs/triggers/enums) con
lo que el codigo actual de la app espera. El .sql original no incluia algunas columnas/tablas
que el backend ya usa (probablemente quedaron pendientes de una version anterior). Este script
es idempotente (todo con IF NOT EXISTS) y no toca datos existentes.

Uso:
    cd backend
    python patch_baseline_schema.py
"""

from sqlalchemy import text

from src.config.database import engine

STATEMENTS = [
    # --- documentos.carpetas: falta la columna que vincula carpetas a una licitacion ---
    "ALTER TABLE documentos.carpetas ADD COLUMN IF NOT EXISTS licitacion_id UUID REFERENCES licitaciones.licitaciones(id) ON DELETE CASCADE",
    "CREATE INDEX IF NOT EXISTS idx_carpetas_licitacion ON documentos.carpetas (licitacion_id)",
    # --- licitaciones.licitaciones: columnas que el codigo actual lee/escribe ---
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS rup_url TEXT",
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS rup_texto TEXT",
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS checklist_excluidos JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS indicadores_financieros_requeridos JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS indicadores_financieros_rup_manual JSONB DEFAULT '{}'::jsonb",
    # --- negocio.entidades: falta por completo (usada por EntidadController) ---
    """
    CREATE TABLE IF NOT EXISTS negocio.entidades (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(255) NOT NULL,
        nit VARCHAR(20) NOT NULL UNIQUE,
        tipo VARCHAR(100),
        direccion TEXT,
        telefono VARCHAR(20),
        email VARCHAR(255),
        sitio_web VARCHAR(255),
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_entidades_nit ON negocio.entidades (nit)",
    """
    DROP TRIGGER IF EXISTS trg_entidades_updated_at ON negocio.entidades;
    CREATE TRIGGER trg_entidades_updated_at BEFORE UPDATE ON negocio.entidades
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    """,
    # --- seguridad.usuarios_permisos: falta por completo (overrides de permisos) ---
    """
    CREATE TABLE IF NOT EXISTS seguridad.usuarios_permisos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
        permiso_key VARCHAR(100) NOT NULL,
        otorgado BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (usuario_id, permiso_key)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_usuarios_permisos_usuario ON seguridad.usuarios_permisos (usuario_id)",
]


def run():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Ejecutando:\n{statement.strip()[:120]}...")
            conn.execute(text(statement))
    print("\nPatch de esquema base completado correctamente.")


if __name__ == "__main__":
    run()
