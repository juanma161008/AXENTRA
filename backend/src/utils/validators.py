import re
from typing import Optional
from datetime import datetime

def validate_email(email: str) -> bool:
    """Validar formato de email"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone: str) -> bool:
    """Validar formato de teléfono (Colombia)"""
    pattern = r'^(\+?57)?[0-9]{10}$'
    return re.match(pattern, phone) is not None

def validate_nit(nit: str) -> bool:
    """Validar formato de NIT (Colombia)"""
    pattern = r'^[0-9]{8,10}-[0-9]$'
    return re.match(pattern, nit) is not None

def validate_password(password: str) -> bool:
    """Validar fortaleza de contraseña"""
    if len(password) < 6:
        return False
    # Debe tener al menos una mayúscula, una minúscula y un número
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    return has_upper and has_lower and has_digit

def validate_date(date_str: str) -> Optional[datetime]:
    """Validar y convertir fecha"""
    try:
        return datetime.fromisoformat(date_str)
    except ValueError:
        return None

def sanitize_input(text: str) -> str:
    """Sanitizar texto para evitar XSS"""
    if not text:
        return ""
    # Eliminar etiquetas HTML
    text = re.sub(r'<[^>]*>', '', text)
    return text.strip()