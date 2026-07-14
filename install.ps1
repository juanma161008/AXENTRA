# ============================================
# AXENTRA - INSTALACIÓN COMPLETA
# ============================================

Write-Host "🚀 Instalando Axentra Frontend Completo..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Instalar dependencias
Write-Host "`n📦 Instalando dependencias..." -ForegroundColor Yellow
npm install

# Verificar instalación
Write-Host "`n✅ Verificando instalación..." -ForegroundColor Yellow
npm list --depth=0

# Iniciar servidor
Write-Host "`n🚀 Iniciando servidor de desarrollo..." -ForegroundColor Green
npm run dev
