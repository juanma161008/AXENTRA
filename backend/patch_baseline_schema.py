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
    "ALTER TABLE licitaciones.licitaciones ADD COLUMN IF NOT EXISTS ultima_alerta_enviada DATE",
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
    # --- licitaciones.oportunidades: avisos rapidos (URL SECOP + comentario) para que el
    # equipo no dependa de un Word en una carpeta compartida ---
    """
    CREATE TABLE IF NOT EXISTS licitaciones.oportunidades (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id UUID,
        url_secop TEXT NOT NULL,
        comentario TEXT,
        fecha_presentacion TIMESTAMP,
        estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        licitacion_id UUID,
        creado_por UUID,
        revisado_por UUID,
        revisado_en TIMESTAMP,
        empresa_asignada_por UUID,
        empresa_asignada_en TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    # Tabla creada en una version anterior sin estas columnas: agregarlas si faltan.
    "ALTER TABLE licitaciones.oportunidades ADD COLUMN IF NOT EXISTS fecha_presentacion TIMESTAMP",
    "ALTER TABLE licitaciones.oportunidades ADD COLUMN IF NOT EXISTS empresa_asignada_por UUID",
    "ALTER TABLE licitaciones.oportunidades ADD COLUMN IF NOT EXISTS empresa_asignada_en TIMESTAMP",
    # Un admin sin empresa filtrada puede dejarla sin asignar todavia (visible para todos).
    "ALTER TABLE licitaciones.oportunidades ALTER COLUMN empresa_id DROP NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_oportunidades_empresa ON licitaciones.oportunidades (empresa_id)",
    "CREATE INDEX IF NOT EXISTS idx_oportunidades_estado ON licitaciones.oportunidades (estado)",
    # --- seguridad.mensajes: mensajeria interna entre usuarios (correo local, sin SMTP real) ---
    """
    CREATE TABLE IF NOT EXISTS seguridad.mensajes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        remitente_id UUID,
        destinatario_id UUID NOT NULL,
        asunto VARCHAR(255),
        cuerpo TEXT NOT NULL,
        tipo VARCHAR(30) NOT NULL DEFAULT 'mensaje',
        leido BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Tabla creada en una version anterior sin esta columna, o con remitente_id obligatorio
    # (los avisos automaticos del sistema -alertas- no tienen un usuario remitente real).
    "ALTER TABLE seguridad.mensajes ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'mensaje'",
    "ALTER TABLE seguridad.mensajes ALTER COLUMN remitente_id DROP NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_mensajes_destinatario ON seguridad.mensajes (destinatario_id)",
    "CREATE INDEX IF NOT EXISTS idx_mensajes_remitente ON seguridad.mensajes (remitente_id)",
]


def run():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Ejecutando:\n{statement.strip()[:120]}...")
            conn.execute(text(statement))
    print("\nPatch de esquema base completado correctamente.")


if __name__ == "__main__":
    run()
