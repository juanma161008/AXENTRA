"""Catalogo de permisos granulares por usuario.

El rol de un usuario define un conjunto de permisos por defecto (ROLE_DEFAULT_PERMISSIONS).
Un admin puede otorgar o revocar permisos puntuales por usuario (tabla usuarios_permisos),
que siempre pisan el default de su rol para esa clave.
"""

PERMISSIONS = {
    "licitaciones.crear": {"label": "Crear licitaciones", "modulo": "Licitaciones"},
    "licitaciones.eliminar": {"label": "Eliminar licitaciones", "modulo": "Licitaciones"},
    "documentos.eliminar": {"label": "Eliminar documentos", "modulo": "Biblioteca"},
    "checklist.gestionar": {"label": "Agregar/eliminar requisitos personalizados", "modulo": "Checklist"},
    "reportes.ver": {"label": "Ver reportes", "modulo": "Reportes"},
    "usuarios.gestionar": {"label": "Gestionar usuarios", "modulo": "Administración"},
    "empresas.gestionar": {"label": "Gestionar empresas", "modulo": "Administración"},
    "entidades.gestionar": {"label": "Gestionar entidades", "modulo": "Administración"},
}

ROLE_DEFAULT_PERMISSIONS = {
    "super_admin": set(PERMISSIONS.keys()),
    "admin_empresa": {
        "licitaciones.crear",
        "licitaciones.eliminar",
        "documentos.eliminar",
        "checklist.gestionar",
        "reportes.ver",
        "empresas.gestionar",
        "entidades.gestionar",
    },
    "editor": {
        "licitaciones.crear",
        "documentos.eliminar",
        "checklist.gestionar",
        "reportes.ver",
    },
    "visor": {"reportes.ver"},
}


def default_permissions_for_roles(roles) -> set:
    result = set()
    for role in roles or []:
        result |= ROLE_DEFAULT_PERMISSIONS.get(role, set())
    return result


def effective_permissions(roles, overrides: dict) -> set:
    """overrides: {permiso_key: otorgado(bool)} explicitos del usuario."""
    result = default_permissions_for_roles(roles)
    for key, otorgado in (overrides or {}).items():
        if otorgado:
            result.add(key)
        else:
            result.discard(key)
    return result


def has_permission(user, key: str, overrides: dict = None) -> bool:
    if overrides is None:
        overrides = getattr(user, "permisos_overrides", None) or {}
    if key in overrides:
        return bool(overrides[key])
    return key in default_permissions_for_roles(getattr(user, "roles", []) or [])


def load_overrides(user_id, db) -> dict:
    from src.models.usuario_permiso import UsuarioPermiso

    rows = (
        db.query(UsuarioPermiso.permiso_key, UsuarioPermiso.otorgado)
        .filter(UsuarioPermiso.usuario_id == user_id)
        .all()
    )
    return {key: otorgado for key, otorgado in rows}
