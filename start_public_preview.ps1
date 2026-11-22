$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$serverRoot = "C:\NovelHubServer"
$mysqlExe = Join-Path $serverRoot "mysql\mysql-8.4.9-winx64\bin\mysqld.exe"
$mysqlConfig = Join-Path $serverRoot "my.ini"
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
$cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source

function Test-ListeningPort([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Wait-ForPort([int]$Port, [int]$Seconds = 30) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-ListeningPort $Port) { return }
    Start-Sleep -Seconds 1
  }
  throw "Nothing started listening on port $Port. Check the NovelHub logs in $serverRoot."
}

if (-not (Test-ListeningPort 3306)) {
  if (-not (Test-Path $mysqlExe) -or -not (Test-Path $mysqlConfig)) {
    throw "Local MySQL runtime is missing from $serverRoot."
  }
  Start-Process -FilePath $mysqlExe -ArgumentList @("--defaults-file=$mysqlConfig", "--console") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $serverRoot "mysql.log") -RedirectStandardError (Join-Path $serverRoot "mysql-error.log")
  Wait-ForPort 3306
}

if (-not (Test-ListeningPort 8000)) {
  Start-Process -FilePath $python -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000") -WorkingDirectory (Join-Path $root "backend") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $serverRoot "backend.log") -RedirectStandardError (Join-Path $serverRoot "backend-error.log")
  Wait-ForPort 8000
}

& (Join-Path $root "start_lan_preview.ps1")
Wait-ForPort 5173
Wait-ForPort 5174

function Get-OrStartTunnel([int]$Port, [string]$Name) {
  $stdout = Join-Path $serverRoot "$Name-tunnel.log"
  $stderr = Join-Path $serverRoot "$Name-tunnel-error.log"
  $existing = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape("http://127.0.0.1:$Port") } | Select-Object -First 1
  if (-not $existing) {
    Start-Process -FilePath $cloudflared -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$Port", "--protocol", "http2", "--edge-ip-version", "4", "--no-autoupdate") -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  }
  for ($i = 0; $i -lt 30; $i++) {
    $combined = ""
    foreach ($file in @($stdout, $stderr)) {
      if (Test-Path $file) { $combined += Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue }
    }
    $match = [regex]::Match($combined, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) { return $match.Value }
    Start-Sleep -Seconds 1
  }
  throw "Cloudflare did not provide a public URL for port $Port. Review $stderr."
}

$websiteUrl = Get-OrStartTunnel 5173 "website"
$adminUrl = Get-OrStartTunnel 5174 "admin"
$links = @(
  "NovelHub website: $websiteUrl",
  "NovelHub admin:   $adminUrl",
  "Backend API:      $websiteUrl/api",
  "Health check:     $websiteUrl/api/health",
  "Flutter physical device: flutter run --dart-define=API_BASE_URL=http://192.168.1.4:8000",
  "Flutter through tunnel:   flutter run --dart-define=API_BASE_URL=$websiteUrl",
  "Build a remote-preview APK: flutter build apk --release --dart-define=API_BASE_URL=$websiteUrl",
  "APK output: C:\lakmal_code\novel_v7\build\app\outputs\flutter-apk\app-release.apk"
)
$links | Set-Content -LiteralPath (Join-Path $serverRoot "preview-links.txt") -Encoding UTF8
$links
