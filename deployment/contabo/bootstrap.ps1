$ErrorActionPreference = 'Stop'

$sshDir = Join-Path $env:USERPROFILE '.ssh'
$keyPath = Join-Path $sshDir 'id_ed25519_contabo_novelhub'
$envPath = Join-Path $sshDir 'novelhub-contabo.env'
$archive = Get-ChildItem (Join-Path $env:TEMP 'novelhub-contabo-*.tar.gz') |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName

if (-not (Test-Path -LiteralPath $keyPath)) { throw "SSH key not found: $keyPath" }
if (Test-Path -LiteralPath $envPath) { throw "Secrets file already exists; refusing to overwrite: $envPath" }
if (-not $archive) { throw 'Deployment archive not found in the Windows temp folder.' }

function New-HexSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

$mysqlRoot = New-HexSecret
$mysqlApp = New-HexSecret
$jwt = New-HexSecret
$admin = New-HexSecret
$envLines = @(
    "MYSQL_ROOT_PASSWORD=$mysqlRoot",
    'MYSQL_DATABASE=novel_app_db',
    'MYSQL_USER=novelhub',
    "MYSQL_PASSWORD=$mysqlApp",
    "JWT_SECRET=$jwt",
    'ADMIN_USERNAME=admin_Supun',
    "ADMIN_PASSWORD=$admin",
    'WEB_AUTH_ORIGINS=http://144.91.102.11',
    'CORS_ORIGINS=http://144.91.102.11'
)
Set-Content -LiteralPath $envPath -Value $envLines -Encoding ascii
icacls.exe $envPath /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(F)" 'NT AUTHORITY\SYSTEM:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to the local secrets file.' }

scp.exe -i $keyPath -o IdentitiesOnly=yes $archive 'root@144.91.102.11:/tmp/novelhub-release.tar.gz'
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the deployment archive.' }
scp.exe -i $keyPath -o IdentitiesOnly=yes $envPath 'root@144.91.102.11:/tmp/novelhub-production.env'
if ($LASTEXITCODE -ne 0) { throw "Could not upload server configuration. Secrets remain in $envPath" }

$remote = 'set -eu; test -d /opt/novelhub; tar -xzf /tmp/novelhub-release.tar.gz -C /opt/novelhub; install -m 600 /tmp/novelhub-production.env /opt/novelhub/deployment/contabo/.env; rm -f /tmp/novelhub-production.env /tmp/novelhub-release.tar.gz; docker compose -f /opt/novelhub/deployment/contabo/compose.yml --env-file /opt/novelhub/deployment/contabo/.env config --quiet; echo DEPLOY_FILES_READY'
ssh.exe -i $keyPath -o IdentitiesOnly=yes 'root@144.91.102.11' $remote
if ($LASTEXITCODE -ne 0) { throw "VPS setup failed. Local secrets remain in $envPath" }

Write-Output 'Deployment files and generated secrets are installed on the VPS.'
Write-Output "Local secrets and initial admin credentials: $envPath"
