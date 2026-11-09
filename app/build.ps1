# Build Hoki for Windows (app\target\release\hoki.exe): copies the web app into app\dist, then cargo build.
#   powershell -ExecutionPolicy Bypass -File app\build.ps1 [-Offline]
# Needs Rust (rustup) and the WebView2 runtime (built into Windows 10/11).
param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$app = $PSScriptRoot
$root = Split-Path $app -Parent
$dist = Join-Path $app 'dist'

if (Test-Path $dist) {
    Remove-Item $dist -Recurse -Force
}
New-Item -ItemType Directory $dist | Out-Null
foreach ($item in 'index.html', 'manifest.webmanifest', 'css', 'js', 'assets') {
    Copy-Item (Join-Path $root $item) $dist -Recurse
}

Push-Location $app
try {
    $cargoArgs = @('build', '--release')
    if ($Offline) {
        $cargoArgs += '--offline'
    }
    & cargo @cargoArgs
    if ($LASTEXITCODE -ne 0) {
        throw "cargo build failed ($LASTEXITCODE)"
    }
} finally {
    Pop-Location
}
Get-Item (Join-Path $app 'target\release\hoki.exe') | Select-Object FullName, Length
