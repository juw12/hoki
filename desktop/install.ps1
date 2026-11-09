# Install Hoki for the current user (no admin needed).
#
#   irm https://juw12.github.io/hoki/desktop/install.ps1 | iex
#
# Installs the Hoki Windows app (one small Hoki.exe, uses the WebView2 runtime built into Windows 10/11)
# in %LOCALAPPDATA%\Hoki, adds Start menu shortcuts "Hoki" (the full app) and "Hoki Lucky Cat"
# (the live 3D cat on your desktop), and starts the desktop cat.
# If the app cannot be downloaded, it falls back to the older lightweight PowerShell widget.
#
# Uninstall: right-click the cat > Hide Hoki, close the app, then delete %LOCALAPPDATA%\Hoki,
# %APPDATA%\io.github.juw12.hoki and the two Start menu shortcuts.
#
# For local testing set $env:HOKI_SOURCE to a checkout folder instead of the website
# (it then uses app\target\release\hoki.exe from that checkout when present).

$ErrorActionPreference = 'Stop'
$source = if ($env:HOKI_SOURCE) { $env:HOKI_SOURCE } else { 'https://juw12.github.io/hoki' }
$appUrl = 'https://github.com/juw12/hoki/releases/latest/download/Hoki.exe'
$installDir = Join-Path $env:LOCALAPPDATA 'Hoki'
New-Item -ItemType Directory -Force $installDir | Out-Null

# Updating: stop any running cat first, the old PowerShell widget (wherever it was started from)
# and the app itself, so the files can be replaced.
$running = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*-File*hoki-widget.ps1*' }
foreach ($process in $running) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $process.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
}
Get-Process -Name 'hoki' -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $_.Id -Timeout 5 -ErrorAction SilentlyContinue
}

function New-HokiShortcut($name, $target, $arguments, $icon, $description) {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) "$name.lnk"))
    $link.TargetPath = $target
    $link.Arguments = $arguments
    $link.WorkingDirectory = $installDir
    $link.IconLocation = $icon
    $link.Description = $description
    $link.Save()
}

function Install-LegacyWidget {
    # The cat is pre-rendered from the web app's 3D model: frames\cat_00.png ... plus frames\frames.json.
    New-Item -ItemType Directory -Force (Join-Path $installDir 'frames') | Out-Null
    $files = [ordered]@{
        'desktop/hoki-widget.ps1'    = 'hoki-widget.ps1'
        'desktop/frames/frames.json' = 'frames\frames.json'
        'assets/icon-192.png'        = 'icon-192.png'
    }
    for ($i = 0; $i -le 12; $i++) {
        $name = 'cat_{0:D2}.png' -f $i
        $files["desktop/frames/$name"] = "frames\$name"
    }
    Remove-Item (Join-Path $installDir 'cat.svg') -ErrorAction SilentlyContinue
    foreach ($relative in $files.Keys) {
        $target = Join-Path $installDir $files[$relative]
        if ($source -match '^https?://') {
            Invoke-WebRequest -UseBasicParsing "$source/$relative" -OutFile $target
        } else {
            Copy-Item (Join-Path $source $relative) $target -Force
        }
        Unblock-File $target -ErrorAction SilentlyContinue
    }

    # Wrap the PNG in an .ico (Windows accepts PNG-compressed icons) for the shortcuts.
    $png = [IO.File]::ReadAllBytes((Join-Path $installDir 'icon-192.png'))
    $ico = New-Object IO.MemoryStream
    $writer = New-Object IO.BinaryWriter($ico)
    $writer.Write([int16]0)
    $writer.Write([int16]1)
    $writer.Write([int16]1)
    $writer.Write([byte]192)
    $writer.Write([byte]192)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([int16]1)
    $writer.Write([int16]32)
    $writer.Write([int]$png.Length)
    $writer.Write([int]22)
    $writer.Write($png)
    [IO.File]::WriteAllBytes((Join-Path $installDir 'hoki.ico'), $ico.ToArray())

    $widget = Join-Path $installDir 'hoki-widget.ps1'
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$widget`""

    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Hoki Lucky Cat.lnk'))
    $link.TargetPath = $powershell
    $link.Arguments = $arguments
    $link.WorkingDirectory = $installDir
    $link.WindowStyle = 7
    $link.IconLocation = Join-Path $installDir 'hoki.ico'
    $link.Description = 'A waving lucky cat. Click it for a luck boost.'
    $link.Save()

    Start-Process $powershell -ArgumentList $arguments -WindowStyle Hidden
    Write-Host 'Hoki is waving on the right edge of your desktop. Click it for luck, drag to move, right-click for options.'
    Write-Host 'Start it again any time from the Start menu: "Hoki Lucky Cat".'
}

function Install-HokiApp {
    $exe = Join-Path $installDir 'Hoki.exe'
    $localBuild = if ($env:HOKI_SOURCE) { Join-Path $env:HOKI_SOURCE 'app\target\release\hoki.exe' } else { $null }
    if ($localBuild -and (Test-Path $localBuild)) {
        Copy-Item $localBuild $exe -Force
    } else {
        $partial = "$exe.download"
        Invoke-WebRequest -UseBasicParsing $appUrl -OutFile $partial
        if ((Get-Item $partial).Length -lt 500KB) {
            throw 'Hoki.exe download looks incomplete'
        }
        Move-Item $partial $exe -Force
    }
    Unblock-File $exe -ErrorAction SilentlyContinue

    New-HokiShortcut 'Hoki' $exe '' "$exe,0" 'Hoki, the waving lucky cat. Tap for a luck boost.'
    New-HokiShortcut 'Hoki Lucky Cat' $exe '--widget' "$exe,0" 'The live 3D lucky cat on your desktop.'
    Start-Process $exe -ArgumentList '--widget'
    Write-Host 'Hoki is waving on your desktop (bottom right). It watches your mouse; click it for luck,'
    Write-Host 'drag to move, right-click for size, sound and "Open Hoki".'
    Write-Host 'Start menu: "Hoki" opens the full app, "Hoki Lucky Cat" brings the desktop cat back.'
}

try {
    Install-HokiApp
} catch {
    Write-Warning "Could not install the Hoki app ($($_.Exception.Message)); installing the lightweight widget instead."
    Install-LegacyWidget
}
