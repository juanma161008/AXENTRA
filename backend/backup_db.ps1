# Respaldo diario de la base de datos AXENTRA.
# Genera un dump plano (.sql) con la fecha en el nombre (nunca sobreescribe un dia
# anterior), para que un respaldo corrupto o una corrida fallida no borre el ultimo
# respaldo bueno.
#
# Uso manual:
#   powershell -File backend\backup_db.ps1
#
# Se registra ademas como tarea programada diaria (ver AXENTRA-DB-Backup en el
# Programador de tareas de Windows).

$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Error "No se encontro backend\.env"
    exit 1
}

$envVars = @{}
Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') {
        $envVars[$matches[1]] = $matches[2]
    }
}

$dbHost = $envVars["DB_HOST"]
$dbPort = $envVars["DB_PORT"]
$dbName = $envVars["DB_NAME"]
$dbUser = $envVars["DB_USER"]
$dbPassword = $envVars["DB_PASSWORD"]

$pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName

if (-not $pgDump) {
    Write-Error "No se encontro pg_dump.exe en C:\Program Files\PostgreSQL\*\bin"
    exit 1
}

$backupsDir = Join-Path $PSScriptRoot "backups"
if (-not (Test-Path $backupsDir)) {
    New-Item -ItemType Directory -Path $backupsDir | Out-Null
}

$dateStamp = Get-Date -Format "yyyy-MM-dd"
$outFile = Join-Path $backupsDir "axentra_backup_$dateStamp.sql"
$tmpFile = "$outFile.tmp"
$logFile = Join-Path $backupsDir "backup_log.txt"

$env:PGPASSWORD = $dbPassword

# Se vuelca primero a un .tmp: si pg_dump falla o queda a medias, nunca se pisa un
# respaldo bueno de ese mismo dia (solo se renombra a .sql si termino OK).
& $pgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p --no-owner --no-privileges -f $tmpFile

$exitCode = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($exitCode -eq 0) {
    Move-Item -Path $tmpFile -Destination $outFile -Force
    $size = (Get-Item $outFile).Length
    Add-Content -Path $logFile -Value "$timestamp OK - $outFile ($size bytes)"
    Write-Host "Respaldo generado correctamente: $outFile"
} else {
    Remove-Item -Path $tmpFile -ErrorAction SilentlyContinue
    Add-Content -Path $logFile -Value "$timestamp ERROR - pg_dump exit code $exitCode"
    Write-Error "pg_dump fallo con codigo $exitCode"
    exit $exitCode
}
