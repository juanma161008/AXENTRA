import csv
import io
import json
import os
import re
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

try:
    from openpyxl import Workbook
except ImportError:
    Workbook = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from PyPDF2 import PdfReader
except ImportError:
    try:
        from pypdf import PdfReader
    except ImportError:
        PdfReader = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None

from src.models.documento import Carpeta, Documento
from src.models.empresa import Empresa
from src.models.licitacion import Licitacion, RequisitoChecklist

OCR_ENGINE: Optional[Any] = None

DEFAULT_REQUIRED_DOCUMENTS = [
    {
        "key": "rup",
        "nombre": "RUP vigente",
        "descripcion": "Registro unico de proponentes actualizado y legible.",
        "keywords": ["rup", "registro unico de proponentes", "registro unico"],
        "categoria": "habilitante",
        "obligatorio": True,
    },
    {
        "key": "camara",
        "nombre": "Certificado de existencia y representacion legal",
        "descripcion": "Camara de comercio o equivalente, vigente.",
        "keywords": ["existencia", "representacion legal", "camara de comercio", "certificado mercantil"],
        "categoria": "juridico",
        "obligatorio": True,
    },
    {
        "key": "rut",
        "nombre": "RUT",
        "descripcion": "Registro unico tributario actualizado.",
        "keywords": ["rut", "registro unico tributario"],
        "categoria": "tributario",
        "obligatorio": True,
    },
    {
        "key": "financiero",
        "nombre": "Estados financieros",
        "descripcion": "Estados financieros recientes, firmados cuando aplique.",
        "keywords": ["estados financieros", "balance", "estado de resultados", "revisor fiscal"],
        "categoria": "financiero",
        "obligatorio": True,
    },
    {
        "key": "presentacion",
        "nombre": "Carta de presentacion",
        "descripcion": "Carta de presentacion o propuesta firmada.",
        "keywords": ["carta de presentacion", "carta propuesta", "presentacion de la oferta"],
        "categoria": "juridico",
        "obligatorio": True,
    },
    {
        "key": "cedula",
        "nombre": "Cedula representante legal",
        "descripcion": "Copia de la cedula del representante legal.",
        "keywords": ["cedula", "documento de identidad", "representante legal"],
        "categoria": "juridico",
        "obligatorio": True,
    },
    {
        "key": "experiencia",
        "nombre": "Experiencia habilitante",
        "descripcion": "Certificaciones o soportes de experiencia.",
        "keywords": ["experiencia", "certificacion", "contrato", "acta de liquidacion"],
        "categoria": "tecnico",
        "obligatorio": True,
    },
    {
        "key": "garantia",
        "nombre": "Garantia de seriedad",
        "descripcion": "Garantia o poliza de seriedad de la oferta.",
        "keywords": ["seriedad de la oferta", "garantia de seriedad", "poliza de seriedad"],
        "categoria": "financiero",
        "obligatorio": False,
    },
    {
        "key": "parafiscales",
        "nombre": "Seguridad social y parafiscales",
        "descripcion": "Soportes de aportes a seguridad social y parafiscales.",
        "keywords": ["seguridad social", "parafiscales", "salud", "pension"],
        "categoria": "juridico",
        "obligatorio": True,
    },
    {
        "key": "anexos",
        "nombre": "Anexos tecnicos",
        "descripcion": "Anexos tecnicos, fichas y formatos del pliego.",
        "keywords": ["anexo tecnico", "ficha tecnica", "especificaciones", "anexo"],
        "categoria": "tecnico",
        "obligatorio": False,
    },
]


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip().lower()


# ============================================
# INDICADORES FINANCIEROS / CAPACIDAD ORGANIZACIONAL (RUP)
# ============================================

def _valor_pattern(label: str) -> str:
    """Construye un patron tolerante a como PyMuPDF/OCR aplanan las tablas del RUP: entre la
    etiqueta del indicador y su valor puede haber espacios, puntos de relleno, guiones o incluso
    un salto de linea (cuando la columna de valores queda separada de la de etiquetas)."""
    return rf"{label}[^\d\n]{{0,40}}\n?[^\d\n]{{0,40}}([\d]+(?:[.,]\d+)?)"


_LABEL_LIQUIDEZ = r"[IÍ]NDICE\s+DE\s+LIQUIDEZ"
_LABEL_ENDEUDAMIENTO = r"[IÍ]NDICE\s+DE\s+ENDEUDAMIENTO"
_LABEL_COBERTURA_INTERESES = r"RAZ[OÓ]N\s+DE\s+COBERTURA\s+DE\s+INTERESES"
_LABEL_RENT_PATRIMONIO = r"RENTABILIDAD\s+DEL\s+PATRIMONIO"
_LABEL_RENT_ACTIVO = r"RENTABILIDAD\s+DEL\s+ACTIVO"

INDICADORES_FINANCIEROS_DEF = {
    "indice_liquidez": {
        "nombre": "Índice de liquidez",
        "label": _LABEL_LIQUIDEZ,
        "patron": _valor_pattern(_LABEL_LIQUIDEZ),
        "operador": ">=",
        "unidad": "ratio",
    },
    "indice_endeudamiento": {
        "nombre": "Índice de endeudamiento",
        "label": _LABEL_ENDEUDAMIENTO,
        "patron": _valor_pattern(_LABEL_ENDEUDAMIENTO),
        "operador": "<=",
        "unidad": "porcentaje",
    },
    "razon_cobertura_intereses": {
        "nombre": "Razón de cobertura de intereses",
        "label": _LABEL_COBERTURA_INTERESES,
        "patron": _valor_pattern(_LABEL_COBERTURA_INTERESES),
        "operador": ">=",
        "unidad": "ratio",
    },
    "rentabilidad_patrimonio": {
        "nombre": "Rentabilidad del patrimonio",
        "label": _LABEL_RENT_PATRIMONIO,
        "patron": _valor_pattern(_LABEL_RENT_PATRIMONIO),
        "operador": ">=",
        "unidad": "porcentaje",
    },
    "rentabilidad_activo": {
        "nombre": "Rentabilidad del activo",
        "label": _LABEL_RENT_ACTIVO,
        "patron": _valor_pattern(_LABEL_RENT_ACTIVO),
        "operador": ">=",
        "unidad": "porcentaje",
    },
}

# Patrones para intentar detectar, en el pliego, el minimo/maximo exigido para cada indicador.
# Son heuristicos (el texto del pliego varia mucho): si no encuentran nada, el usuario lo
# digita a mano y ese valor manual siempre tiene prioridad.
_REQUISITO_KEYWORDS = r"(?:mayor\s+o\s+igual\s+a|superior\s+o\s+igual\s+a|mínimo|minimo|no\s+inferior\s+a|inferior\s+o\s+igual\s+a|máximo|maximo|no\s+superior\s+a)"


def _parse_decimal_co(valor: Any) -> Optional[float]:
    """Convierte un numero a float aceptando formato colombiano ('0,21' / '1.234,56')
    y tambien el formato con punto decimal, por si se digita a mano en el formulario."""
    if valor is None:
        return None
    texto = str(valor).strip()
    if not texto:
        return None

    tiene_coma = "," in texto
    tiene_punto = "." in texto

    try:
        if tiene_coma and tiene_punto:
            return float(texto.replace(".", "").replace(",", "."))
        if tiene_coma:
            return float(texto.replace(",", "."))
        return float(texto)
    except ValueError:
        return None


def _normalizar_porcentaje(valor: float) -> float:
    """La Camara de Comercio no es consistente en como imprime los porcentajes en el RUP/pliego:
    algunas certificaciones ya traen la fraccion (p. ej. '0,17' = 17%) y otras traen el numero
    completo (p. ej. '32.45' = 32.45%). El resto del pipeline (entrada manual e
    IndicadoresFinancieros.jsx) siempre guarda/espera la fraccion (0-1), asi que solo se divide
    entre 100 cuando el valor leido es mayor a 1 (es decir, cuando claramente NO es ya una
    fraccion)."""
    return valor / 100 if valor > 1 else valor


def extraer_indicadores_financieros_rup(texto: str) -> Dict[str, Dict[str, Any]]:
    """Lee del RUP los indicadores financieros/de capacidad organizacional (formato estandar
    de Camara de Comercio: 'INDICADOR : valor')."""
    if not texto:
        return {}

    resultado = {}
    for key, definicion in INDICADORES_FINANCIEROS_DEF.items():
        match = re.search(definicion["patron"], texto, re.IGNORECASE)
        if not match:
            continue
        valor = _parse_decimal_co(match.group(1))
        if valor is None:
            continue
        if definicion["unidad"] == "porcentaje":
            valor = _normalizar_porcentaje(valor)
        resultado[key] = {
            "key": key,
            "nombre": definicion["nombre"],
            "valor": valor,
            "valor_texto": match.group(1).strip(),
        }
    return resultado


def extraer_requisitos_financieros_pliego(texto: str) -> Dict[str, Dict[str, Any]]:
    """Intento heuristico de detectar, en el pliego, el minimo/maximo exigido por indicador.
    Es un punto de partida (OCR); el usuario siempre puede corregirlo a mano."""
    if not texto:
        return {}

    resultado = {}
    for key, definicion in INDICADORES_FINANCIEROS_DEF.items():
        patron = rf"{definicion['label']}[^\n]{{0,100}}?{_REQUISITO_KEYWORDS}[^\d]{{0,15}}([\d.,]+)"
        match = re.search(patron, texto, re.IGNORECASE)
        if not match:
            continue
        valor = _parse_decimal_co(match.group(1))
        if valor is None:
            continue
        if definicion["unidad"] == "porcentaje":
            valor = _normalizar_porcentaje(valor)
        resultado[key] = {"key": key, "valor": valor, "valor_texto": match.group(1).strip()}
    return resultado


def comparar_indicadores_financieros(
    rup_texto: Optional[str],
    pliego_texto: Optional[str],
    requeridos_manual: Optional[Dict[str, Any]] = None,
    rup_manual: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Combina lo detectado en el RUP y el pliego con lo que el usuario haya digitado a mano
    (manual siempre tiene prioridad sobre el OCR) y marca si cumple (verde) o no (rojo).
    La tabla siempre trae los 5 indicadores estandar, tengan dato o no."""
    valores_rup_ocr = extraer_indicadores_financieros_rup(rup_texto)
    requeridos_ocr = extraer_requisitos_financieros_pliego(pliego_texto)
    requeridos_manual = requeridos_manual or {}
    rup_manual = rup_manual or {}

    filas = []
    for key, definicion in INDICADORES_FINANCIEROS_DEF.items():
        rup_manual_valor = _parse_decimal_co(rup_manual.get(key))
        rup_ocr_item = valores_rup_ocr.get(key)

        if rup_manual_valor is not None:
            valor_rup = rup_manual_valor
            fuente_rup = "manual"
        elif rup_ocr_item is not None:
            valor_rup = rup_ocr_item["valor"]
            fuente_rup = "rup_ocr"
        else:
            valor_rup = None
            fuente_rup = None

        requerido_manual_valor = _parse_decimal_co(requeridos_manual.get(key))
        ocr_item = requeridos_ocr.get(key)

        if requerido_manual_valor is not None:
            valor_requerido = requerido_manual_valor
            fuente_requerido = "manual"
        elif ocr_item is not None:
            valor_requerido = ocr_item["valor"]
            fuente_requerido = "pliego_ocr"
        else:
            valor_requerido = None
            fuente_requerido = None

        cumple = None
        if valor_rup is not None and valor_requerido is not None:
            if definicion["operador"] == ">=":
                cumple = valor_rup >= valor_requerido
            else:
                cumple = valor_rup <= valor_requerido

        filas.append(
            {
                "key": key,
                "nombre": definicion["nombre"],
                "operador": definicion["operador"],
                "unidad": definicion["unidad"],
                "valor_rup": valor_rup,
                "fuente_rup": fuente_rup,
                "valor_requerido": valor_requerido,
                "fuente_requerido": fuente_requerido,
                "cumple": cumple,
            }
        )

    return filas


def limpiar_codigo(codigo: str) -> str:
    if codigo is None:
        return ""
    return re.sub(r"\D", "", str(codigo))


def formatear_codigo(codigo: str) -> str:
    codigo = limpiar_codigo(codigo)
    if len(codigo) == 8:
        return f"{codigo[0:2]} {codigo[2:4]} {codigo[4:6]} {codigo[6:8]}"
    return codigo


def obtener_codigos_desde_texto(texto: str) -> List[str]:
    lineas = [line.strip() for line in re.split(r"[\n,;]+", texto or "") if line.strip()]
    codigos = []
    for item in lineas[:10]:
        limpio = limpiar_codigo(item)
        if limpio:
            codigos.append(limpio)
    return codigos


def _get_ocr_engine() -> Optional[Any]:
    global OCR_ENGINE
    if RapidOCR is None:
        return None
    if OCR_ENGINE is None:
        OCR_ENGINE = RapidOCR()
    return OCR_ENGINE


def _ocr_image_bytes(image_bytes: bytes) -> str:
    engine = _get_ocr_engine()
    if engine is None:
        return ""
    try:
        result, _ = engine(image_bytes)
    except Exception:
        return ""

    textos = []
    for block in result or []:
        if isinstance(block, (list, tuple)) and len(block) >= 2 and block[1]:
            textos.append(str(block[1]).strip())
    return "\n".join([line for line in textos if line])


def _extract_pdf_text_with_reader(file_bytes: bytes) -> Dict[str, Any]:
    if PdfReader is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No se pudo procesar el PDF porque faltan librerias de lectura. "
                "Instala PyMuPDF o PyPDF2/pypdf en el backend."
            ),
        )

    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []
    for page in reader.pages:
        pages_text.append((page.extract_text() or "").strip())

    combined = "\n".join([page_text for page_text in pages_text if page_text.strip()])
    return {
        "text": combined,
        "page_count": len(reader.pages),
        "used_ocr": False,
        "ocr_pages": [],
        "text_length": len(combined),
    }


def extract_text_from_pdf_bytes(file_bytes: bytes) -> Dict[str, Any]:
    if fitz is None:
        return _extract_pdf_text_with_reader(file_bytes)

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages_text = []
    ocr_pages = []

    for page_number, page in enumerate(doc, start=1):
        text = (page.get_text("text") or "").strip()
        if len(text) >= 80 or RapidOCR is None:
            pages_text.append(text)
            continue

        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        ocr_text = _ocr_image_bytes(pix.tobytes("png"))
        if ocr_text.strip():
            pages_text.append(ocr_text)
            ocr_pages.append(page_number)
        else:
            pages_text.append(text)

    combined = "\n".join([page_text for page_text in pages_text if page_text.strip()])
    return {
        "text": combined,
        "page_count": len(doc),
        "used_ocr": bool(ocr_pages),
        "ocr_pages": ocr_pages,
        "text_length": len(combined),
    }


def extract_text_from_file_bytes(file_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    ext = os.path.splitext((filename or "").lower())[1]
    if ext in {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}:
        text = _ocr_image_bytes(file_bytes)
        return {
            "text": text,
            "page_count": 1,
            "used_ocr": True,
            "ocr_pages": [1] if text else [],
            "text_length": len(text),
        }

    if ext == ".pdf" or file_bytes[:4] == b"%PDF":
        return extract_text_from_pdf_bytes(file_bytes)

    try:
        text = file_bytes.decode("utf-8", errors="ignore")
    except Exception:
        text = ""

    return {
        "text": text,
        "page_count": 1,
        "used_ocr": False,
        "ocr_pages": [],
        "text_length": len(text),
    }


EXPERIENCE_BLOCK_RE = re.compile(
    r"(?:\*{0,3}\s*)?EXPERIENCIA\s*No\.(\d+)\s*:(.*?)(?=(?:\*{0,3}\s*)?EXPERIENCIA\s*No\.\d+\s*:|$)",
    re.DOTALL | re.IGNORECASE,
)

UNSPSC_RE = re.compile(r"(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s*:\s*(.+)", re.IGNORECASE)


def extraer_experiencias(texto: str) -> List[Dict[str, Any]]:
    texto = (texto or "").replace("\r", "\n")
    texto = re.sub(r"\n{2,}", "\n", texto)

    experiencias: List[Dict[str, Any]] = []
    for match in EXPERIENCE_BLOCK_RE.finditer(texto):
        numero_exp = match.group(1).strip()
        bloque = match.group(2)

        consecutivo = ""
        contratista = ""
        contratante = ""
        valor_smmlv = ""

        consecutivo_match = re.search(r"N(?:ÚMERO|UMERO)\s+CONSECUTIVO\s+DEL\s+CONTRATO\s*:\s*(.+)", bloque, re.IGNORECASE)
        if consecutivo_match:
            consecutivo = consecutivo_match.group(1).strip().split("\n")[0].strip()

        contratista_match = re.search(r"NOMBRE\s+DEL\s+CONTRATISTA\s*:\s*(.+)", bloque, re.IGNORECASE)
        if contratista_match:
            contratista = contratista_match.group(1).strip().split("\n")[0].strip()

        contratante_match = re.search(r"NOMBRE\s+DEL\s+CONTRATANTE\s*:\s*(.+)", bloque, re.IGNORECASE)
        if contratante_match:
            contratante = contratante_match.group(1).strip().split("\n")[0].strip()

        valor_match = re.search(r"VALOR\s+CONTRATADO\s+EN\s+SMMLV\s*:\s*(.+)", bloque, re.IGNORECASE)
        if valor_match:
            valor_smmlv = valor_match.group(1).strip().split("\n")[0].strip()

        codigos = []
        for code_match in UNSPSC_RE.finditer(bloque):
            codigo_raw = "".join(code_match.groups()[:4])
            descripcion = code_match.group(5).strip()
            codigos.append(
                {
                    "codigo": codigo_raw,
                    "codigo_formateado": formatear_codigo(codigo_raw),
                    "descripcion": descripcion,
                }
            )

        experiencias.append(
            {
                "experiencia_no": numero_exp,
                "consecutivo_contrato": consecutivo,
                "contratista": contratista,
                "contratante": contratante,
                "valor_smmlv": valor_smmlv,
                "codigos": codigos,
                "total_codigos": len(codigos),
            }
        )

    return experiencias


def buscar_coincidencias(experiencias: List[Dict[str, Any]], codigos_usuario: List[str]) -> List[Dict[str, Any]]:
    codigos_usuario = [limpiar_codigo(c) for c in codigos_usuario if limpiar_codigo(c)]
    resultados: List[Dict[str, Any]] = []

    for experiencia in experiencias:
        codigos_experiencia = {item["codigo"]: item for item in experiencia["codigos"]}
        encontrados = [codigo for codigo in codigos_usuario if codigo in codigos_experiencia]
        if not encontrados:
            continue

        resultados.append(
            {
                "experiencia_no": experiencia["experiencia_no"],
                "consecutivo_contrato": experiencia["consecutivo_contrato"],
                "contratante": experiencia["contratante"],
                "contratista": experiencia["contratista"],
                "valor_smmlv": experiencia["valor_smmlv"],
                "codigos_encontrados": [formatear_codigo(codigo) for codigo in encontrados],
                "cantidad_coincidencias": len(encontrados),
                "detalle_coincidencias": [
                    {
                        "codigo": formatear_codigo(codigo),
                        "descripcion": codigos_experiencia[codigo]["descripcion"],
                    }
                    for codigo in encontrados
                ],
            }
        )

    return sorted(
        resultados,
        key=lambda item: (-item["cantidad_coincidencias"], int(item["experiencia_no"]) if str(item["experiencia_no"]).isdigit() else 0),
    )


def extraer_codigos_pliego(texto: str) -> List[Dict[str, Any]]:
    """Codigos UNSPSC mencionados en el pliego. A diferencia del RUP, el pliego no trae
    bloques 'EXPERIENCIA No.X', asi que se busca el patron 'XX XX XX XX: descripcion' en
    todo el documento."""
    if not texto:
        return []

    resultados: List[Dict[str, Any]] = []
    vistos = set()
    for match in UNSPSC_RE.finditer(texto):
        codigo_raw = "".join(match.groups()[:4])
        if codigo_raw in vistos:
            continue
        vistos.add(codigo_raw)
        descripcion = match.group(5).strip().split("\n")[0][:200]
        resultados.append(
            {
                "codigo": codigo_raw,
                "codigo_formateado": formatear_codigo(codigo_raw),
                "descripcion": descripcion,
            }
        )
    return resultados


def comparar_codigos_pliego_rup(pliego_texto: Optional[str], rup_texto: Optional[str]) -> Optional[Dict[str, Any]]:
    """Compara los codigos UNSPSC exigidos por el pliego contra los que aparecen en las
    experiencias del RUP, para saber cuales ya se pueden acreditar."""
    if not pliego_texto or not rup_texto:
        return None

    codigos_pliego = extraer_codigos_pliego(pliego_texto)
    experiencias_rup = extraer_experiencias(rup_texto)

    rup_por_codigo: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for experiencia in experiencias_rup:
        for codigo in experiencia["codigos"]:
            rup_por_codigo[codigo["codigo"]].append(
                {
                    "experiencia_no": experiencia["experiencia_no"],
                    "contratante": experiencia["contratante"],
                    "contratista": experiencia["contratista"],
                }
            )

    comunes = []
    faltantes = []
    for item in codigos_pliego:
        entry = {
            "codigo": item["codigo"],
            "codigo_formateado": item["codigo_formateado"],
            "descripcion_pliego": item["descripcion"],
        }
        if item["codigo"] in rup_por_codigo:
            comunes.append({**entry, "experiencias_rup": rup_por_codigo[item["codigo"]]})
        else:
            faltantes.append(entry)

    return {
        "codigos_pliego_total": len(codigos_pliego),
        "codigos_rup_total": len(rup_por_codigo),
        "codigos_comunes": sorted(comunes, key=lambda row: row["codigo"]),
        "codigos_faltantes": sorted(faltantes, key=lambda row: row["codigo"]),
    }


def tabla_codigos(experiencias: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for experiencia in experiencias:
        for codigo in experiencia["codigos"]:
            rows.append(
                {
                    "experiencia_no": experiencia["experiencia_no"],
                    "consecutivo_contrato": experiencia["consecutivo_contrato"],
                    "contratante": experiencia["contratante"],
                    "contratista": experiencia["contratista"],
                    "codigo": codigo["codigo_formateado"],
                    "descripcion": codigo["descripcion"],
                }
            )
    return rows


def _extract_numbers(texto: str) -> List[float]:
    tokens = re.findall(r"(?<!\w)(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d+)?", texto or "")
    numbers: List[float] = []
    for token in tokens:
        normalized = token.replace(".", "").replace(",", ".")
        try:
            numbers.append(float(normalized))
        except ValueError:
            continue
    return numbers


REQUISITO_KEYWORD_RE = re.compile(
    r"(?i)(el proponente deber|la propuesta deber|el oferente deber|se requiere|es obligatorio|"
    r"debe(?:r[aá])? acreditar|debe(?:r[aá])? presentar|debe(?:r[aá])? anexar|debe(?:r[aá])? cumplir|"
    r"debe(?:r[aá])? garantizar)"
)


def extraer_requisitos_sugeridos(texto: str, limite: int = 15) -> List[str]:
    """Heuristica: lineas del pliego que probablemente describen un requisito exigido."""
    if not texto:
        return []

    sugerencias: List[str] = []
    vistos = set()

    for linea in re.split(r"[\n\r]+", texto):
        limpio = re.sub(r"\s+", " ", linea).strip(" .-*•")
        if not (15 <= len(limpio) <= 220):
            continue
        if not REQUISITO_KEYWORD_RE.search(limpio):
            continue

        firma = normalize_text(limpio)[:120]
        if firma in vistos:
            continue
        vistos.add(firma)
        sugerencias.append(limpio)
        if len(sugerencias) >= limite:
            break

    return sugerencias


def analyze_text(texto: str, codigos_usuario: Optional[List[str]] = None) -> Dict[str, Any]:
    experiencias = extraer_experiencias(texto)
    codigos_busqueda = [limpiar_codigo(c) for c in (codigos_usuario or []) if limpiar_codigo(c)]
    coincidencias = buscar_coincidencias(experiencias, codigos_busqueda) if codigos_busqueda else []
    codigos_extraidos = tabla_codigos(experiencias)

    numeros = _extract_numbers(texto)
    porcentajes = re.findall(r"\b\d+(?:[.,]\d+)?\s*%", texto or "")
    smmlv = re.findall(r"\b\d+(?:[.,]\d+)?\s*SMMLV\b", texto or "", re.IGNORECASE)
    monedas = re.findall(r"\$\s*[\d\.,]+", texto or "")

    resumen = {
        "experiencias_detectadas": len(experiencias),
        "codigos_extraidos": len(codigos_extraidos),
        "coincidencias_detectadas": len(coincidencias),
        "codigos_busqueda": [formatear_codigo(codigo) for codigo in codigos_busqueda],
        "numeros_detectados": len(numeros),
        "suma_numeros": round(sum(numeros), 2) if numeros else 0,
        "promedio_numeros": round(sum(numeros) / len(numeros), 2) if numeros else 0,
        "maximo_numero": max(numeros) if numeros else 0,
        "minimo_numero": min(numeros) if numeros else 0,
        "porcentajes_detectados": len(porcentajes),
        "smmlv_menciones": len(smmlv),
        "valores_monetarios": len(monedas),
    }

    return {
        "experiencias": experiencias,
        "coincidencias": coincidencias,
        "codigos_extraidos": codigos_extraidos,
        "resumen": resumen,
        "texto_preview": (texto or "")[:5000],
        "texto_completo": texto or "",
        "requisitos_sugeridos": extraer_requisitos_sugeridos(texto),
    }


def analyze_file_bytes(file_bytes: bytes, filename: str = "", codigos_usuario: Optional[List[str]] = None) -> Dict[str, Any]:
    extracted = extract_text_from_file_bytes(file_bytes, filename)
    analysis = analyze_text(extracted["text"], codigos_usuario)
    return {
        "archivo": {
            "nombre": filename,
            "page_count": extracted["page_count"],
            "used_ocr": extracted["used_ocr"],
            "ocr_pages": extracted["ocr_pages"],
            "text_length": extracted["text_length"],
        },
        **analysis,
    }


def build_analysis_xlsx_bytes(analysis: Dict[str, Any]) -> bytes:
    if Workbook is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La exportacion a Excel requiere openpyxl. Instala openpyxl en el backend o usa CSV.",
        )

    workbook = Workbook()

    ws = workbook.active
    ws.title = "Coincidencias"
    coincidencias = analysis.get("coincidencias", [])
    if coincidencias:
        headers = [
            "experiencia_no",
            "consecutivo_contrato",
            "contratante",
            "contratista",
            "valor_smmlv",
            "cantidad_coincidencias",
            "codigos_encontrados",
            "detalle_coincidencias",
        ]
        ws.append(headers)
        for row in coincidencias:
            ws.append(
                [
                    row.get("experiencia_no"),
                    row.get("consecutivo_contrato"),
                    row.get("contratante"),
                    row.get("contratista"),
                    row.get("valor_smmlv"),
                    row.get("cantidad_coincidencias"),
                    ", ".join(row.get("codigos_encontrados", [])),
                    " | ".join(
                        f"{item['codigo']} - {item['descripcion']}" for item in row.get("detalle_coincidencias", [])
                    ),
                ]
            )
    else:
        ws.append(["Sin coincidencias"])

    ws_summary = workbook.create_sheet("Resumen")
    for key, value in (analysis.get("resumen") or {}).items():
        if isinstance(value, list):
            value = ", ".join(map(str, value))
        ws_summary.append([key, value])

    ws_exp = workbook.create_sheet("Experiencias")
    ws_exp.append(["experiencia_no", "consecutivo_contrato", "contratante", "contratista", "valor_smmlv", "total_codigos"])
    for exp in analysis.get("experiencias", []):
        ws_exp.append(
            [
                exp.get("experiencia_no"),
                exp.get("consecutivo_contrato"),
                exp.get("contratante"),
                exp.get("contratista"),
                exp.get("valor_smmlv"),
                exp.get("total_codigos"),
            ]
        )

    ws_codes = workbook.create_sheet("Codigos")
    ws_codes.append(["experiencia_no", "consecutivo_contrato", "contratante", "contratista", "codigo", "descripcion"])
    for row in analysis.get("codigos_extraidos", []):
        ws_codes.append(
            [
                row.get("experiencia_no"),
                row.get("consecutivo_contrato"),
                row.get("contratante"),
                row.get("contratista"),
                row.get("codigo"),
                row.get("descripcion"),
            ]
        )

    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    return output.read()


def build_analysis_csv_text(analysis: Dict[str, Any]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "experiencia_no",
            "consecutivo_contrato",
            "contratante",
            "contratista",
            "valor_smmlv",
            "cantidad_coincidencias",
            "codigos_encontrados",
            "detalle_coincidencias",
        ]
    )

    for row in analysis.get("coincidencias", []):
        writer.writerow(
            [
                row.get("experiencia_no"),
                row.get("consecutivo_contrato"),
                row.get("contratante"),
                row.get("contratista"),
                row.get("valor_smmlv"),
                row.get("cantidad_coincidencias"),
                ", ".join(row.get("codigos_encontrados", [])),
                " | ".join(f"{item['codigo']} - {item['descripcion']}" for item in row.get("detalle_coincidencias", [])),
            ]
        )

    return output.getvalue()


def build_checklist_pdf_bytes(licitacion, items: List[Dict[str, Any]], resumen: Dict[str, Any]) -> bytes:
    """Genera un PDF simple con el estado del checklist (documentos obligatorios y personalizados)."""
    if fitz is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La generacion de PDF requiere PyMuPDF instalado en el backend.",
        )

    doc = fitz.open()
    page = doc.new_page()
    margin = 50
    state = {"y": 60, "page": page}

    def draw(text: str, size: float = 11, font: str = "helv", color=(0, 0, 0), gap: float = 8):
        if state["y"] > state["page"].rect.height - 60:
            state["page"] = doc.new_page()
            state["y"] = 60
        state["page"].insert_text((margin, state["y"]), text, fontsize=size, fontname=font, color=color)
        state["y"] += size + gap

    draw("CHECKLIST DE DOCUMENTOS", size=16, font="hebo")
    draw(f"Proceso: {licitacion.numero_secop or 'Sin numero'}", size=11, font="hebo")
    draw(f"Entidad: {licitacion.entidad_contratante or 'Sin definir'}", size=11)
    draw(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", size=9, color=(0.45, 0.45, 0.45))
    state["y"] += 4
    draw(
        f"Cobertura obligatoria: {resumen.get('cobertura_porcentaje', 0)}% "
        f"({resumen.get('obligatorios_cumplidos', 0)}/{resumen.get('obligatorios_total', 0)} cumplidos)",
        size=12,
        font="hebo",
    )
    state["y"] += 8

    for item in items:
        cumple = bool(item.get("cumple"))
        etiqueta = "CUMPLE" if cumple else "PENDIENTE"
        color = (0, 0.5, 0) if cumple else (0.75, 0, 0)
        obligatorio = " (obligatorio)" if item.get("obligatorio") else " (opcional)"
        draw(f"[{etiqueta}] {item.get('nombre', '')}{obligatorio}", size=11, color=color)
        detalle = item.get("documento_nombre") or item.get("descripcion")
        if detalle:
            draw(f"    {str(detalle)[:110]}", size=9, color=(0.4, 0.4, 0.4), gap=10)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def serialize_empresa(empresa: Empresa) -> Dict[str, Any]:
    return {
        "id": str(empresa.id),
        "grupo_empresarial_id": str(empresa.grupo_empresarial_id) if empresa.grupo_empresarial_id else None,
        "nombre": empresa.nombre,
        "nit": empresa.nit,
        "direccion": empresa.direccion,
        "telefono": empresa.telefono,
        "email": empresa.email,
        "sitio_web": empresa.sitio_web,
        "logo_url": empresa.logo_url,
        "activo": empresa.activo,
        "created_at": empresa.created_at.isoformat() if empresa.created_at else None,
        "updated_at": empresa.updated_at.isoformat() if empresa.updated_at else None,
    }


def serialize_licitacion(licitacion: Licitacion) -> Dict[str, Any]:
    cuantia = float(licitacion.cuantia) if licitacion.cuantia is not None else None
    dias_restantes = None
    if licitacion.fecha_cierre:
        dias_restantes = (licitacion.fecha_cierre.date() - datetime.now().date()).days

    return {
        "id": str(licitacion.id),
        "empresa_id": str(licitacion.empresa_id),
        "numero_secop": licitacion.numero_secop,
        "url_secop": licitacion.url_secop,
        "entidad_contratante": licitacion.entidad_contratante,
        "nit_entidad": licitacion.nit_entidad,
        "objeto_contrato": licitacion.objeto_contrato,
        "cuantia": cuantia,
        "estado": licitacion.estado,
        "fecha_publicacion": licitacion.fecha_publicacion.isoformat() if licitacion.fecha_publicacion else None,
        "fecha_apertura": licitacion.fecha_apertura.isoformat() if licitacion.fecha_apertura else None,
        "fecha_cierre": licitacion.fecha_cierre.isoformat() if licitacion.fecha_cierre else None,
        "fecha_subsanacion": licitacion.fecha_subsanacion.isoformat() if licitacion.fecha_subsanacion else None,
        "fecha_adjudicacion": licitacion.fecha_adjudicacion.isoformat() if licitacion.fecha_adjudicacion else None,
        "fecha_visita_obra": licitacion.fecha_visita_obra.isoformat() if licitacion.fecha_visita_obra else None,
        "pliego_url": licitacion.pliego_url,
        "pliego_texto": licitacion.pliego_texto,
        "rup_url": licitacion.rup_url,
        "rup_texto": licitacion.rup_texto,
        "notas": licitacion.notas,
        "usuario_creador": str(licitacion.usuario_creador) if licitacion.usuario_creador else None,
        "created_at": licitacion.created_at.isoformat() if licitacion.created_at else None,
        "updated_at": licitacion.updated_at.isoformat() if licitacion.updated_at else None,
        "dias_restantes": dias_restantes,
    }


def serialize_documento(documento: Documento) -> Dict[str, Any]:
    return {
        "id": str(documento.id),
        "carpeta_id": str(documento.carpeta_id) if documento.carpeta_id else None,
        "empresa_id": str(documento.empresa_id),
        "nombre": documento.nombre,
        "nombre_original": documento.nombre_original,
        "tipo_documento": documento.tipo_documento,
        "descripcion": documento.descripcion,
        "ruta_archivo": documento.ruta_archivo,
        "tamanio_bytes": documento.tamanio_bytes,
        "formato": documento.formato,
        "version": documento.version,
        "vigente": documento.vigente,
        "fecha_vencimiento": documento.fecha_vencimiento.isoformat() if documento.fecha_vencimiento else None,
        "tags": documento.tags,
        "meta_data": documento.meta_data or {},
        "usuario_subida": str(documento.usuario_subida) if documento.usuario_subida else None,
        "created_at": documento.created_at.isoformat() if documento.created_at else None,
        "updated_at": documento.updated_at.isoformat() if documento.updated_at else None,
    }


def serialize_carpeta(carpeta: Carpeta) -> Dict[str, Any]:
    return {
        "id": str(carpeta.id),
        "empresa_id": str(carpeta.empresa_id),
        "carpeta_padre_id": str(carpeta.carpeta_padre_id) if carpeta.carpeta_padre_id else None,
        "nombre": carpeta.nombre,
        "descripcion": carpeta.descripcion,
        "icono": carpeta.icono,
        "color": carpeta.color,
        "created_at": carpeta.created_at.isoformat() if carpeta.created_at else None,
        "updated_at": carpeta.updated_at.isoformat() if carpeta.updated_at else None,
    }


def build_folder_tree(folders: List[Carpeta], documents: List[Documento]) -> Dict[str, Any]:
    folders_by_parent: Dict[Optional[str], List[Carpeta]] = defaultdict(list)
    docs_by_folder: Dict[Optional[str], List[Documento]] = defaultdict(list)

    for folder in folders:
        parent_id = str(folder.carpeta_padre_id) if folder.carpeta_padre_id else None
        folders_by_parent[parent_id].append(folder)

    for document in documents:
        folder_id = str(document.carpeta_id) if document.carpeta_id else None
        docs_by_folder[folder_id].append(document)

    def build_node(folder: Carpeta, level: int, prefix: str) -> Dict[str, Any]:
        node_path = f"{prefix}/{folder.nombre}" if prefix else folder.nombre
        folder_id = str(folder.id)
        child_nodes = [build_node(child, level + 1, node_path) for child in sorted(folders_by_parent.get(folder_id, []), key=lambda item: item.nombre.lower())]
        folder_docs = [serialize_documento(doc) for doc in sorted(docs_by_folder.get(folder_id, []), key=lambda item: item.nombre.lower())]

        return {
            **serialize_carpeta(folder),
            "nivel": level,
            "ruta": node_path,
            "documentos": folder_docs,
            "hijos": child_nodes,
            "total_documentos": len(folder_docs),
            "total_hijos": len(child_nodes),
        }

    arbol = [build_node(folder, 0, "") for folder in sorted(folders_by_parent.get(None, []), key=lambda item: item.nombre.lower())]
    documentos_raiz = [serialize_documento(doc) for doc in sorted(docs_by_folder.get(None, []), key=lambda item: item.nombre.lower())]

    return {
        "arbol": arbol,
        "documentos_raiz": documentos_raiz,
    }


def _document_signature(documento: Documento) -> str:
    parts = [
        documento.nombre,
        documento.nombre_original,
        documento.tipo_documento,
        documento.descripcion,
        documento.tags,
        json.dumps(documento.meta_data or {}, ensure_ascii=False) if documento.meta_data else "",
    ]
    return normalize_text(" ".join(filter(None, parts)))


def build_required_documents_status(
    documents: List[Documento], excluidos: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    excluidos_set = set(excluidos or [])
    docs_signatures = [
        {
            "id": str(documento.id),
            "nombre": documento.nombre,
            "firma": _document_signature(documento),
        }
        for documento in documents
    ]

    result = []
    for rule in DEFAULT_REQUIRED_DOCUMENTS:
        if rule["key"] in excluidos_set:
            continue

        matched_document = None
        matched_keyword = None
        for document_signature in docs_signatures:
            for keyword in rule["keywords"]:
                if keyword in document_signature["firma"]:
                    matched_document = document_signature
                    matched_keyword = keyword
                    break
            if matched_document:
                break

        result.append(
            {
                "key": rule["key"],
                "nombre": rule["nombre"],
                "descripcion": rule["descripcion"],
                "categoria": rule["categoria"],
                "obligatorio": rule["obligatorio"],
                "cumple": matched_document is not None,
                "documento_id": matched_document["id"] if matched_document else None,
                "documento_nombre": matched_document["nombre"] if matched_document else None,
                "match_keyword": matched_keyword,
                "personalizado": False,
                "requisito_id": None,
                "excluible": True,
            }
        )

    return result


def build_checklist_items(
    licitacion_id: str, documents: List[Documento], db: Session, excluidos: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """Checklist base (DEFAULT_REQUIRED_DOCUMENTS, menos los excluidos) + requisitos personalizados."""
    items = build_required_documents_status(documents, excluidos)

    docs_signatures = [
        {
            "id": str(documento.id),
            "nombre": documento.nombre,
            "firma": _document_signature(documento),
        }
        for documento in documents
    ]

    custom_requisitos = (
        db.query(RequisitoChecklist)
        .filter(RequisitoChecklist.licitacion_id == licitacion_id, RequisitoChecklist.tipo == "global")
        .order_by(RequisitoChecklist.orden, RequisitoChecklist.created_at)
        .all()
    )

    for requisito in custom_requisitos:
        keyword = normalize_text(requisito.nombre)
        matched_document = None
        if keyword:
            for document_signature in docs_signatures:
                if keyword in document_signature["firma"]:
                    matched_document = document_signature
                    break

        items.append(
            {
                "key": f"custom:{requisito.id}",
                "requisito_id": str(requisito.id),
                "nombre": requisito.nombre,
                "descripcion": requisito.descripcion_original or "Requisito agregado para esta licitacion",
                "categoria": "personalizado",
                "obligatorio": requisito.obligatorio if requisito.obligatorio is not None else True,
                "cumple": matched_document is not None,
                "documento_id": matched_document["id"] if matched_document else None,
                "documento_nombre": matched_document["nombre"] if matched_document else None,
                "match_keyword": keyword if matched_document else None,
                "personalizado": True,
            }
        )

    return items


def build_licitacion_explorer(licitacion_id: str, db: Session) -> Dict[str, Any]:
    licitacion = db.query(Licitacion).filter(Licitacion.id == licitacion_id).first()
    if not licitacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Licitacion no encontrada")

    empresa = db.query(Empresa).filter(Empresa.id == licitacion.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    # Solo las carpetas/documentos de ESTA licitacion, no de toda la empresa.
    folders = db.query(Carpeta).filter(Carpeta.licitacion_id == licitacion.id).order_by(Carpeta.nombre.asc()).all()
    folder_ids = [folder.id for folder in folders]
    documents = (
        db.query(Documento)
        .filter(Documento.carpeta_id.in_(folder_ids))
        .order_by(Documento.created_at.desc())
        .all()
        if folder_ids
        else []
    )

    tree = build_folder_tree(folders, documents)
    required_documents = build_checklist_items(licitacion.id, documents, db, licitacion.checklist_excluidos)
    obligatory_completed = sum(1 for item in required_documents if item["cumple"] and item["obligatorio"])
    obligatory_total = sum(1 for item in required_documents if item["obligatorio"])

    pliego_analysis = None
    if licitacion.pliego_texto:
        pliego_analysis = analyze_text(licitacion.pliego_texto)

    rup_analysis = None
    if licitacion.rup_texto:
        rup_analysis = analyze_text(licitacion.rup_texto)

    comparativo_codigos = comparar_codigos_pliego_rup(licitacion.pliego_texto, licitacion.rup_texto)
    indicadores_financieros = comparar_indicadores_financieros(
        licitacion.rup_texto,
        licitacion.pliego_texto,
        licitacion.indicadores_financieros_requeridos,
        licitacion.indicadores_financieros_rup_manual,
    )

    cuantia = float(licitacion.cuantia) if licitacion.cuantia is not None else 0.0
    calculos = {
        "valor_base": cuantia,
        "iva_19": round(cuantia * 0.19, 2),
        "aiu_10": round(cuantia * 0.10, 2),
        "subtotal_con_iva": round(cuantia * 1.19, 2),
        "total_con_aiu": round(cuantia * 1.10, 2),
        "retencion_2": round(cuantia * 0.02, 2),
    }

    return {
        "licitacion": serialize_licitacion(licitacion),
        "empresa": serialize_empresa(empresa),
        "carpetas": tree["arbol"],
        "documentos_raiz": tree["documentos_raiz"],
        "documentos": [serialize_documento(document) for document in documents],
        "documentos_obligatorios": required_documents,
        "resumen_documental": {
            "total_documentos": len(documents),
            "documentos_vigentes": sum(1 for document in documents if document.vigente),
            "total_carpetas": len(folders),
            "obligatorios_total": obligatory_total,
            "obligatorios_cumplidos": obligatory_completed,
            "obligatorios_pendientes": max(obligatory_total - obligatory_completed, 0),
            "cobertura_porcentaje": round((obligatory_completed / obligatory_total) * 100, 1) if obligatory_total else 0,
        },
        "pliego_analisis": pliego_analysis,
        "rup_analisis": rup_analysis,
        "comparativo_codigos": comparativo_codigos,
        "indicadores_financieros": indicadores_financieros,
        "calculos": calculos,
        "secop": {
            "numero_secop": licitacion.numero_secop,
            "url_secop": licitacion.url_secop,
            "entidad_contratante": licitacion.entidad_contratante,
            "nit_entidad": licitacion.nit_entidad,
            "objeto_contrato": licitacion.objeto_contrato,
            "cuantia": cuantia,
            "estado": licitacion.estado,
            "fecha_cierre": licitacion.fecha_cierre.isoformat() if licitacion.fecha_cierre else None,
            "dias_restantes": serialize_licitacion(licitacion)["dias_restantes"],
        },
    }
