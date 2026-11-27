$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
# Git for Windows ships GNU tar, which treats "C:\..." as a remote host.
# Use the Windows tar (bsdtar) so Windows archive paths work.
$tarExe = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path -LiteralPath $tarExe)) { $tarExe = 'tar.exe' }
$stage = Join-Path $env:TEMP ("novelhub-contabo-" + [guid]::NewGuid().ToString('N'))
$archive = "$stage.tar.gz"

$copies = @(
    @('backend\app', 'backend\app'),
    @('backend\sql', 'backend\sql'),
    @('story_card_images', 'story_card_images'),
    @('website\dist', 'deployment\contabo\website\dist'),
    @('admin-panel\dist', 'deployment\contabo\website\dist\admin')
)

foreach ($copy in $copies) {
    $source = Join-Path $repo $copy[0]
    $target = Join-Path $stage $copy[1]
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    robocopy.exe $source $target /E /XD __pycache__ .venv node_modules /XF *.pyc | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Copy failed for $($copy[0]): $LASTEXITCODE" }
}

foreach ($file in @('backend\Dockerfile', 'backend\requirements.txt', 'backend\.dockerignore')) {
    Copy-Item -LiteralPath (Join-Path $repo $file) -Destination (Join-Path $stage 'backend')
}
foreach ($file in @('compose.yml', 'nginx.conf')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $stage 'deployment\contabo')
}

& $tarExe -czf $archive -C $stage .
if ($LASTEXITCODE -ne 0) { throw 'Could not create deployment archive.' }
Get-Item -LiteralPath $archive | Select-Object FullName, Length
