$ErrorActionPreference = 'Stop'
$keyPath = Join-Path $env:USERPROFILE '.ssh\id_ed25519_contabo_novelhub'
$envPath = Join-Path $env:USERPROFILE '.ssh\novelhub-contabo.env'
$inputPath = Join-Path $env:USERPROFILE '.ssh\novelhub-root-password.input'

if (-not (Test-Path -LiteralPath $envPath)) { throw 'Local restricted deployment secrets file is missing.' }

$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$rootPassword = ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()

Add-Content -LiteralPath $envPath -Value "VPS_ROOT_PASSWORD=$rootPassword" -Encoding ascii
Set-Content -LiteralPath $inputPath -Value "root:$rootPassword" -Encoding ascii
icacls.exe $inputPath /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(F)" 'NT AUTHORITY\SYSTEM:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the temporary password file.' }

scp.exe -i $keyPath -o IdentitiesOnly=yes $inputPath root@144.91.102.11:/tmp/novelhub-root-password.input
if ($LASTEXITCODE -ne 0) { throw 'Could not transfer the protected password input.' }
ssh.exe -i $keyPath -o IdentitiesOnly=yes root@144.91.102.11 'chmod 600 /tmp/novelhub-root-password.input && chpasswd < /tmp/novelhub-root-password.input && rm -f /tmp/novelhub-root-password.input'
if ($LASTEXITCODE -ne 0) { throw "Root password rotation failed. Check the restricted local file: $envPath" }

Remove-Item -LiteralPath $inputPath -Force
Write-Output "Root password rotated. Keep the restricted credential file private: $envPath"
