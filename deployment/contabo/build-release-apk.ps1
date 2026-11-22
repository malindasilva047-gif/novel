$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$signingRoot = Join-Path $env:LOCALAPPDATA 'Wingsaga\android-release'
$keystorePath = Join-Path $signingRoot 'wingsaga-release.p12'
$passwordPath = Join-Path $signingRoot 'password.dpapi'
$keyAlias = 'wingsaga-release'
$apiBaseUrl = 'https://wingsaga.com'
$keytool = Get-Command keytool.exe -ErrorAction SilentlyContinue

if ($null -eq $keytool) {
    $javaRoot = Join-Path $env:ProgramFiles 'Java'
    $keytoolPath = Get-ChildItem -LiteralPath $javaRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'bin\keytool.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
    if (-not $keytoolPath) { throw 'Java keytool was not found. Install a JDK before creating the release key.' }
}
else {
    $keytoolPath = $keytool.Source
}

New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $signingRoot '/inheritance:r' '/grant:r' "${identity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict release signing files to the current Windows user.' }

if (-not (Test-Path -LiteralPath $keystorePath) -and -not (Test-Path -LiteralPath $passwordPath)) {
    $randomBytes = New-Object 'Byte[]' 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($randomBytes) }
    finally { $rng.Dispose() }
    $password = [Convert]::ToBase64String($randomBytes)
    [Array]::Clear($randomBytes, 0, $randomBytes.Length)

    $encryptedPassword = ConvertFrom-SecureString (
        ConvertTo-SecureString -String $password -AsPlainText -Force
    )
    [IO.File]::WriteAllText($passwordPath, $encryptedPassword, [Text.Encoding]::ASCII)

    $env:ANDROID_RELEASE_STORE_PASSWORD = $password
    $env:ANDROID_RELEASE_KEY_PASSWORD = $password
    $env:ANDROID_RELEASE_KEY_ALIAS = $keyAlias
    try {
        & $keytoolPath -genkeypair -v `
            -keystore $keystorePath `
            -storetype PKCS12 `
            -alias $keyAlias `
            -keyalg RSA `
            -keysize 4096 `
            -validity 10000 `
            -dname 'CN=Wingsaga Android Release,O=Wingsaga' `
            -storepass:env ANDROID_RELEASE_STORE_PASSWORD `
            -keypass:env ANDROID_RELEASE_KEY_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Android release signing key.' }
    }
    catch {
        Remove-Item -LiteralPath $passwordPath -Force -ErrorAction SilentlyContinue
        throw
    }
    finally {
        Remove-Item Env:\ANDROID_RELEASE_STORE_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:\ANDROID_RELEASE_KEY_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:\ANDROID_RELEASE_KEY_ALIAS -ErrorAction SilentlyContinue
    }
}
elseif (-not (Test-Path -LiteralPath $keystorePath) -or -not (Test-Path -LiteralPath $passwordPath)) {
    throw "Release key and encrypted password must both exist in $signingRoot. Refusing to replace either."
}

$encryptedPassword = (Get-Content -LiteralPath $passwordPath -Raw).Trim()
$securePassword = ConvertTo-SecureString $encryptedPassword
$passwordPointer = [IntPtr]::Zero
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $env:ANDROID_RELEASE_STORE_FILE = $keystorePath
    $env:ANDROID_RELEASE_STORE_PASSWORD = $password
    $env:ANDROID_RELEASE_KEY_ALIAS = $keyAlias
    $env:ANDROID_RELEASE_KEY_PASSWORD = $password
    $buildOutput = Join-Path $repo 'build\app\outputs\flutter-apk\app-release.apk'

    Push-Location $repo
    try {
        # Build one APK containing ARM and x86 Android libraries so users do
        # not need to choose a device-specific ABI split.
        flutter build apk --release --build-number=4020 "--dart-define=API_BASE_URL=$apiBaseUrl"
        if ($LASTEXITCODE -ne 0) { throw 'Flutter release APK build failed.' }
    }
    finally { Pop-Location }
}
finally {
    Remove-Item Env:\ANDROID_RELEASE_STORE_FILE -ErrorAction SilentlyContinue
    Remove-Item Env:\ANDROID_RELEASE_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\ANDROID_RELEASE_KEY_ALIAS -ErrorAction SilentlyContinue
    Remove-Item Env:\ANDROID_RELEASE_KEY_PASSWORD -ErrorAction SilentlyContinue
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $password = $null
}

if (-not (Test-Path -LiteralPath $buildOutput)) { throw "Release APK was not created: $buildOutput" }
$apksigner = Join-Path $env:ANDROID_HOME 'build-tools\35.0.0\apksigner.bat'
$aapt = Join-Path $env:ANDROID_HOME 'build-tools\35.0.0\aapt.exe'
if (-not (Test-Path -LiteralPath $apksigner)) { throw "APK signature verifier not found: $apksigner" }
if (-not (Test-Path -LiteralPath $aapt)) { throw "APK manifest verifier not found: $aapt" }

$signature = & $apksigner verify --print-certs $buildOutput
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
if ($signature -match 'CN=Android Debug') { throw 'Refusing to release an APK signed with the Android debug key.' }
$badging = & $aapt dump badging $buildOutput
$package = $badging | Select-Object -First 1
if (
    $package -notmatch "name='com\.example\.novel_mobile_app' versionCode='(\d+)' versionName='1\.0\.17'" -or
    [int]$Matches[1] -lt 4020
) {
    throw "Unexpected application ID or version in release APK: $package"
}
$nativeCode = ($badging | Where-Object { $_ -like 'native-code:*' }) -join ' '
foreach ($abi in @('armeabi-v7a', 'arm64-v8a', 'x86_64')) {
    if ($nativeCode -notmatch [Regex]::Escape($abi)) {
        throw "Universal release APK is missing Android architecture $abi."
    }
}

$publicCopy = Join-Path $repo 'website\public\downloads\wingsaga-android-universal-release.apk'
Copy-Item -LiteralPath $buildOutput -Destination $publicCopy -Force
Write-Output "Verified signed universal release APK: $buildOutput"
Write-Output "Public download asset: $publicCopy"
$signature | Where-Object { $_ -match 'certificate SHA-1 digest' } | ForEach-Object { Write-Output $_ }
Write-Output "Release keystore backup is required: $keystorePath"
