param(
    [string]$ApiBaseUrl = 'https://wingsaga.com'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repo
try {
    flutter build apk --debug --split-per-abi "--dart-define=API_BASE_URL=$ApiBaseUrl"
    if ($LASTEXITCODE -ne 0) { throw 'Flutter preview APK build failed.' }
}
finally { Pop-Location }

Write-Output (Join-Path $repo 'build\app\outputs\flutter-apk\app-arm64-v8a-debug.apk')
