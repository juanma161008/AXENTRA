"""Busqueda de procesos de contratacion publica en el dataset abierto de SECOP II
(datos.gov.co, portal de datos abiertos del Estado colombiano), para que el usuario pueda
buscar un proceso real sin salir de la aplicacion y usarlo como punto de partida al crear
una licitacion.

Dataset: "SECOP II - Procesos de Contratacion" (Socrata), id p6dx-8zbt. Es publico y no
requiere autenticacion; un SECOP_APP_TOKEN opcional en el .env solo sirve para subir el
limite de peticiones por hora si el uso crece.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List

SECOP_DATASET_URL = "https://www.datos.gov.co/resource/p6dx-8zbt.json"
SECOP_REQUEST_TIMEOUT = 10


def _normalizar_proceso_secop(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id_proceso": item.get("id_del_proceso"),
        "numero_proceso": item.get("referencia_del_proceso"),
        "entidad": item.get("entidad"),
        "nit_entidad": item.get("nit_entidad"),
        "departamento": item.get("departamento_entidad"),
        "ciudad": item.get("ciudad_entidad"),
        "objeto": item.get("descripci_n_del_procedimiento") or item.get("nombre_del_procedimiento"),
        "modalidad": item.get("modalidad_de_contratacion"),
        "estado": item.get("estado_resumen") or item.get("estado_del_procedimiento"),
        "precio_base": item.get("precio_base"),
        "fecha_publicacion": item.get("fecha_de_publicacion_del"),
        "tipo_contrato": item.get("tipo_de_contrato"),
        "url_proceso": (item.get("urlproceso") or {}).get("url"),
    }


class SecopConsultaError(Exception):
    """No se pudo consultar datos.gov.co (red, timeout, respuesta invalida). Se separa
    explicitamente de 'sin resultados' para no confundir un problema de conectividad con
    que el proceso buscado en verdad no exista en el dataset."""


def buscar_procesos_secop(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Busca por texto libre (numero de proceso, entidad, NIT, objeto...) usando la
    busqueda de texto completo de Socrata ($q), que ya cruza varias columnas a la vez.

    No se fuerza un $order: muchas entidades reutilizan el mismo formato de numero de
    proceso (SAMC-02-2026, CD-005, etc.) a nivel nacional, asi que forzar orden por fecha
    de publicacion puede empujar el resultado que en verdad se busca fuera del limite;
    dejando que Socrata ordene por relevancia de la busqueda de texto se acerca mas a lo
    que el usuario esta buscando."""
    query = (query or "").strip()
    if not query:
        return []

    params = {
        "$q": query,
        "$limit": str(min(max(int(limit), 1), 50)),
    }
    url = f"{SECOP_DATASET_URL}?{urllib.parse.urlencode(params)}"

    headers = {"Accept": "application/json"}
    app_token = os.getenv("SECOP_APP_TOKEN")
    if app_token:
        headers["X-App-Token"] = app_token

    request = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(request, timeout=SECOP_REQUEST_TIMEOUT) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise SecopConsultaError(str(exc)) from exc

    if not isinstance(data, list):
        raise SecopConsultaError("Respuesta inesperada de datos.gov.co")

    return [_normalizar_proceso_secop(item) for item in data]
