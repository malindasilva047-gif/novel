param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if ($Build) {
  $env:VITE_USE_SAME_ORIGIN_API = "true"
  Push-Location (Join-Path $root "website")
  try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw "Website build failed." } }
  finally { Pop-Location }
  Push-Location (Join-Path $root "admin-panel")
  try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw "Admin panel build failed." } }
  finally { Pop-Location }
  Remove-Item Env:\VITE_USE_SAME_ORIGIN_API -ErrorAction SilentlyContinue
}

$servers = @(
  @{ Name = "NovelHub website dev server"; Dir = (Join-Path $root "website"); Port = 5173 },
  @{ Name = "NovelHub admin dev server"; Dir = (Join-Path $root "admin-panel"); Port = 5174 }
)

foreach ($server in $servers) {
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port $server.Port -InformationLevel Quiet -WarningAction SilentlyContinue) {
    Write-Host "$($server.Name) already has a listener on port $($server.Port)."
    continue
  }
  Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$($server.Port)", "--strictPort") `
    -WorkingDirectory $server.Dir -WindowStyle Hidden
}

Write-Host "Website:    http://localhost:5173  (LAN: http://192.168.1.4:5173)"
Write-Host "Admin:      http://localhost:5174  (LAN: http://192.168.1.4:5174)"
Write-Host "API health: http://192.168.1.4:8000/api/health"
