# Arranca el backend asegurando que no quede ningun proceso previo colgado del mismo puerto.
# Evita el problema de procesos zombis acumulados que causaban ECONNRESET intermitentes.

$port = 8001
if (Test-Path "$PSScriptRoot\.env") {
    $envLine = Get-Content "$PSScriptRoot\.env" | Where-Object { $_ -match '^PORT=' }
    if ($envLine) { $port = [int]($envLine -replace 'PORT=', '').Trim() }
}

$existing = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($existing) {
    $pids = $existing.OwningProcess | Select-Object -Unique
    foreach ($p in $pids) {
        Write-Host "Deteniendo proceso previo en el puerto $port (PID $p)..."
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
}

python "$PSScriptRoot\main.py"
