from datetime import datetime, timedelta
from typing import Optional
import re
import random
import string

def generate_random_string(length: int = 10) -> str:
    """Generar string aleatorio"""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def generate_token(length: int = 32) -> str:
    """Generar token aleatorio"""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def calculate_days_until(date: Optional[datetime]) -> Optional[int]:
    """Calcular días hasta una fecha"""
    if not date:
        return None
    today = datetime.now().date()
    diff = date.date() - today
    return diff.days

def format_currency(value: float) -> str:
    """Formatear moneda en pesos colombianos"""
    return f"${value:,.0f}"

def truncate_text(text: str, length: int = 100) -> str:
    """Truncar texto"""
    if len(text) <= length:
        return text
    return text[:length] + "..."

def get_user_agent_info(user_agent: str) -> dict:
    """Extraer información del User-Agent"""
    info = {
        "browser": "Desconocido",
        "os": "Desconocido",
        "device": "Desconocido"
    }
    # Implementación básica
    if "Chrome" in user_agent:
        info["browser"] = "Chrome"
    elif "Firefox" in user_agent:
        info["browser"] = "Firefox"
    elif "Safari" in user_agent:
        info["browser"] = "Safari"
    
    if "Windows" in user_agent:
        info["os"] = "Windows"
    elif "Mac" in user_agent:
        info["os"] = "macOS"
    elif "Linux" in user_agent:
        info["os"] = "Linux"
    
    if "Mobile" in user_agent:
        info["device"] = "Móvil"
    elif "Tablet" in user_agent:
        info["device"] = "Tablet"
    else:
        info["device"] = "Escritorio"
    
    return info