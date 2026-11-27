param(
    [string]$Server = 'root@144.91.102.11'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$keyPath = Join-Path $env:USERPROFILE '.ssh\id_ed25519_contabo_novelhub'
if (-not (Test-Path -LiteralPath $keyPath)) { throw "SSH key not found: $keyPath" }
# Prefer Windows OpenSSH over Git's bundled tools so Windows paths are handled.
$sshExe = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scpExe = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
if (-not (Test-Path -LiteralPath $sshExe)) { $sshExe = 'ssh.exe' }
if (-not (Test-Path -LiteralPath $scpExe)) { $scpExe = 'scp.exe' }

Push-Location (Join-Path $repo 'website')
try { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Website build failed.' } }
finally { Pop-Location }

Push-Location (Join-Path $repo 'admin-panel')
try {
    $env:VITE_USE_SAME_ORIGIN_API = 'true'
    npm run build -- --base=/admin/
    if ($LASTEXITCODE -ne 0) { throw 'Admin panel build failed.' }
}
finally {
    Remove-Item Env:\VITE_USE_SAME_ORIGIN_API -ErrorAction SilentlyContinue
    Pop-Location
}

& (Join-Path $PSScriptRoot 'package.ps1') | Out-Null
$archive = Get-ChildItem (Join-Path $env:TEMP 'novelhub-contabo-*.tar.gz') |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName

& $scpExe -i $keyPath -o IdentitiesOnly=yes $archive "${Server}:/tmp/novelhub-release.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'SCP upload failed.' }
& $scpExe -i $keyPath -o IdentitiesOnly=yes (Join-Path $PSScriptRoot 'novelhub-certbot-renew.service') "${Server}:/tmp/novelhub-certbot-renew.service"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the certificate renewal service.' }
& $scpExe -i $keyPath -o IdentitiesOnly=yes (Join-Path $PSScriptRoot 'novelhub-certbot-renew.timer') "${Server}:/tmp/novelhub-certbot-renew.timer"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the certificate renewal timer.' }

$remote = 'set -eu; tar -xzf /tmp/novelhub-release.tar.gz -C /opt/novelhub; rm -f /tmp/novelhub-release.tar.gz; install -m 644 /tmp/novelhub-certbot-renew.service /etc/systemd/system/novelhub-certbot-renew.service; install -m 644 /tmp/novelhub-certbot-renew.timer /etc/systemd/system/novelhub-certbot-renew.timer; rm -f /tmp/novelhub-certbot-renew.service /tmp/novelhub-certbot-renew.timer; systemctl daemon-reload; systemctl enable --now novelhub-certbot-renew.timer; cd /opt/novelhub/deployment/contabo; docker compose --env-file .env config --quiet; docker compose --env-file .env up -d --build; docker compose --env-file .env restart web'
& $sshExe -i $keyPath -o IdentitiesOnly=yes $Server $remote
if ($LASTEXITCODE -ne 0) { throw 'Remote deploy failed; inspect Docker Compose logs on the VPS.' }

Write-Output 'Uploaded the current working tree directly to Contabo and restarted the stack.'
