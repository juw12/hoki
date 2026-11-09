# Install the Hoki lucky cat desktop widget for the current user (no admin needed).
#
#   irm https://juw12.github.io/hoki/desktop/install.ps1 | iex
#
# Puts the widget script, its 3D cat frames (~1 MB) and an icon in %LOCALAPPDATA%\Hoki, adds a Start menu shortcut
# "Hoki Lucky Cat", and starts the cat. Uninstall: right-click the cat > Quit,
# then delete %LOCALAPPDATA%\Hoki, %APPDATA%\Hoki and the Start menu shortcut.
#
# For local testing set $env:HOKI_SOURCE to a checkout folder instead of the website.

$ErrorActionPreference = 'Stop'
$source = if ($env:HOKI_SOURCE) { $env:HOKI_SOURCE } else { 'https://juw12.github.io/hoki' }
$installDir = Join-Path $env:LOCALAPPDATA 'Hoki'
New-Item -ItemType Directory -Force $installDir | Out-Null

# Updating: stop a running cat first (its single-instance lock would block the new one).
$running = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*-File*Hoki\hoki-widget.ps1*' }
foreach ($process in $running) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $process.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
}

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
