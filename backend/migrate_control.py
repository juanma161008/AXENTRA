"""Migracion puntual (no hay Alembic en este proyecto) para las nuevas funcionalidades de
control: fechas de cronograma, checklist manual con responsable, y semaforo de alertas.

Sigue las mismas convenciones del esquema real (timestamps sin timezone, FKs explicitas,
trigger compartido update_updated_at_column). Es idempotente (todo con IF NOT EXISTS), asi
que se puede correr varias veces sin problema.

Uso:
    cd backend
    python migrate_control.py
"""

from sqlalchemy import text

from src.config.database import engine

STATEMENTS = [
    # --- Nuevas fechas del cronograma ---
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS fecha_consultas TIMESTAMP",
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS fecha_cierre_dudas TIMESTAMP",
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS fecha_evaluacion TIMESTAMP",
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS fechas_personalizadas JSONB DEFAULT '[]'::jsonb",
    # --- Checklist manual (checkbox + responsable) ---
    """
    CREATE TABLE IF NOT EXISTS licitaciones.checklist_estados (
        id UUID PRIMARY KEY,
        licitacion_id UUID NOT NULL REFERENCES licitaciones.licitaciones(id) ON DELETE CASCADE,
        item_key VARCHAR(200) NOT NULL,
        cumplido BOOLEAN DEFAULT FALSE,
        documento_id UUID REFERENCES documentos.documentos(id) ON DELETE SET NULL,
        validado_por UUID REFERENCES seguridad.usuarios(id),
        validado_en TIMESTAMP,
        requiere_subsanacion BOOLEAN DEFAULT FALSE,
        notas_subsanacion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        UNIQUE (licitacion_id, item_key)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_checklist_estados_licitacion ON licitaciones.checklist_estados (licitacion_id)",
    """
    DROP TRIGGER IF EXISTS trg_checklist_estados_updated_at ON licitaciones.checklist_estados;
    CREATE TRIGGER trg_checklist_estados_updated_at BEFORE UPDATE ON licitaciones.checklist_estados
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    """,
    # --- Configuracion global del semaforo de alertas (singleton) ---
    """
    CREATE TABLE IF NOT EXISTS licitaciones.configuracion_alertas (
        id UUID PRIMARY KEY,
        dias_rojo INTEGER DEFAULT 7,
        dias_naranja INTEGER DEFAULT 15,
        updated_at TIMESTAMP,
        updated_by UUID REFERENCES seguridad.usuarios(id)
    )
    """,
]


def run():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Ejecutando:\n{statement.strip()[:120]}...")
            conn.execute(text(statement))
    print("\nMigracion completada correctamente.")


if __name__ == "__main__":
    run()
