@echo off
REM ============================================================
REM Axentra - levantar backend + frontend en un servidor dedicado
REM ============================================================
REM Requisitos que deben estar instalados en el servidor ANTES de
REM correr este script:
REM   - Node.js + npm
REM   - Python 3.11+ con pip
REM   - PostgreSQL corriendo, con la base de datos ya creada (vacia)
REM Ejecutar este .bat desde la raiz del repo (donde esta este archivo).
REM ============================================================

setlocal

echo.
echo === Axentra ===
echo.

REM --- 1) Archivo de configuracion del backend ---
if not exist "backend\.env" (
    echo No existe backend\.env todavia.
    echo Creando uno a partir de backend\.env.example...
    copy "backend\.env.example" "backend\.env" >nul
    echo.
    echo IMPORTANTE: abre backend\.env y completa los datos reales de
    echo este servidor (base de datos, SECRET_KEY, etc.) antes de seguir.
    echo.
    pause
)

REM --- 2) Dependencias de Python ---
echo.
echo Instalando/actualizando dependencias de Python...
pip install -r backend\requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR instalando dependencias de Python. Revisa que "pip" este en el PATH.
    pause
    exit /b 1
)

REM --- 3) Dependencias de Node (raiz y frontend) ---
if not exist "node_modules" (
    echo.
    echo Instalando dependencias de Node en la raiz del proyecto...
    call npm install
    if errorlevel 1 goto :npmerror
)

if not exist "frontend\node_modules" (
    echo.
    echo Instalando dependencias de Node en frontend\...
    pushd frontend
    call npm install
    if errorlevel 1 (
        popd
        goto :npmerror
    )
    popd
)

REM --- 4) Esquema de base de datos ---
REM Estos tres scripts son idempotentes (usan CREATE/ALTER ... IF NOT EXISTS), asi
REM que se pueden correr en cada arranque sin riesgo de duplicar nada ni de tocar
REM datos ya existentes.
echo.
echo Verificando/actualizando el esquema de la base de datos...
pushd backend
python bootstrap_db.py
python patch_baseline_schema.py
python migrate_control.py
popd

REM --- 5) Levantar backend + frontend ---
echo.
echo Iniciando backend y frontend (Ctrl+C para detener ambos)...
echo.
call npm run dev:full

goto :eof

:npmerror
echo.
echo ERROR instalando dependencias de Node. Revisa que "npm" este en el PATH.
pause
exit /b 1
