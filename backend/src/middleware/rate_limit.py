from fastapi import Request, HTTPException, status
from typing import Dict, List
import time
from collections import defaultdict

class RateLimiter:
    """Límite de peticiones por IP"""
    
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, List[float]] = defaultdict(list)
    
    async def __call__(self, request: Request):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        minute_ago = now - 60
        
        # Limpiar requests antiguas
        self.requests[client_ip] = [t for t in self.requests[client_ip] if t > minute_ago]
        
        # Verificar límite
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Demasiadas peticiones. Límite: {self.requests_per_minute} por minuto."
            )
        
        self.requests[client_ip].append(now)
        return True

# Instancia global
rate_limiter = RateLimiter(requests_per_minute=60)