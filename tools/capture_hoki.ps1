<#
Capture the Hoki desktop widget to a PNG.

The widget (desktop/hoki-widget.ps1) is a live WPF window on your desktop. This tool waits
for the desktop to be unlocked, makes sure the widget is running, and captures the actual
on-screen pixels of the widget (the cat plus the wallpaper behind it) into docs/media/
desktop-widget.png, the image used in the README hero.

Run it any time:
    powershell -NoProfile -STA -ExecutionPolicy Bypass -File tools/capture_hoki.ps1

Because it reads the live screen, it must run in the same interactive session that shows the
widget. If the desktop is still locked after the wait, or there is no display, it falls back
to the widget's offscreen -Snapshot render so the docs image is still produced.

Options:
    -Out <png>          output path (default: <repo>\docs\media\desktop-widget.png)
    -Widget <ps1>       the widget script (default: <repo>\desktop\hoki-widget.ps1)
    -NoWaitUnlock       do not wait for the desktop to unlock (when you know it is unlocked)
    -NoLaunch           do not start the widget if it is missing (snapshot fallback instead)
    -UnlockTimeoutSec N max seconds to wait for an unlock (default 300)
    -WindowTimeoutSec N max seconds to wait for the widget window after launching (default 20)
    -SettleSeconds N    pause after the window appears so it is fully painted (default 2)
#>
param(
    [string]$Out,
    [string]$Widget,
    [int]$UnlockTimeoutSec = 300,
    [int]$WindowTimeoutSec = 20,
    [int]$SettleSeconds = 2,
    [switch]$NoWaitUnlock,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot     # repo root (this file lives in tools/)
if (-not $Out)    { $Out = Join-Path $root 'docs\media\desktop-widget.png' }
if (-not $Widget) { $Widget = Join-Path $root 'desktop\hoki-widget.ps1' }
if (-not [IO.Path]::IsPathRooted($Out))    { $Out    = Join-Path $root $Out }
if (-not [IO.Path]::IsPathRooted($Widget)) { $Widget = Join-Path $root $Widget }
$Out    = [IO.Path]::GetFullPath($Out)
$Widget = [IO.Path]::GetFullPath($Widget)

if (-not (Test-Path $Widget)) { throw "widget script not found: $Widget" }
$OutDir = Split-Path -Parent $Out
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---------- screen / window interop ----------
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class HokiWin32 {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref bool pvParam, uint fWinIni);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public static string GetWindowTitle(IntPtr hWnd) {
        var sb = new StringBuilder(512);
        GetWindowText(hWnd, sb, 512);
        return sb.ToString();
    }
}
"@
try { [void][HokiWin32]::SetProcessDPIAware() } catch { }

function Test-DesktopLocked {
    $locked = $false
    [void][HokiWin32]::SystemParametersInfo(0x00A2, 0, [ref]$locked, 0)   # SPI_GETSCREENSAVERRUNNING
    return $locked
}

function Wait-DesktopUnlocked([int]$timeoutSec) {
    Write-Host 'desktop is locked; waiting for it to unlock ...'
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ((Test-DesktopLocked)) {
        if ($sw.Elapsed.TotalSeconds -ge $timeoutSec) { return $false }
        Start-Sleep -Milliseconds 1000
    }
    Write-Host 'desktop unlocked.'
    return $true
}

# Find the running Hoki widget window (title 'Hoki', visible, plausible widget size).
function Get-HokiWindow {
    $found = [System.Collections.Generic.List[object]]::new()
    $proc = [HokiWin32+EnumWindowsProc] {
        param($hWnd, $lParam)
        if ([HokiWin32]::IsWindowVisible($hWnd) -and -not [HokiWin32]::IsIconic($hWnd)) {
            if ([HokiWin32]::GetWindowTitle($hWnd) -eq 'Hoki') {
                $rect = New-Object HokiWin32+RECT
                [void][HokiWin32]::GetWindowRect($hWnd, [ref]$rect)
                $w = $rect.Right - $rect.Left
                $h = $rect.Bottom - $rect.Top
                if ($w -ge 80 -and $w -le 360 -and $h -ge 80 -and $h -le 420) {
                    $found.Add([pscustomobject]@{ Handle = $hWnd; Rect = $rect })
                }
            }
        }
        return $true
    }
    [void][HokiWin32]::EnumWindows($proc, [IntPtr]::Zero)
    if ($found.Count -eq 0) { return $null }
    return $found[0]
}

# Start the widget in the background, then wait for its window to appear.
function Start-WidgetWindow([string]$widgetPath, [int]$timeoutSec, [int]$settleSeconds) {
    $cmd = '-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $widgetPath + '"'
    Start-Process -FilePath 'powershell.exe' -ArgumentList $cmd -WindowStyle Hidden | Out-Null
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
        $win = Get-HokiWindow
        if ($win) { Start-Sleep -Seconds $settleSeconds; return $win }
        Start-Sleep -Milliseconds 500
    }
    return (Get-HokiWindow)
}

# Grab the on-screen pixels that the widget window occupies.
function Get-LiveCapture($rect) {
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)), [System.Drawing.CopyPixelOperation]::SourceCopy)
    $g.Dispose()
    return $bmp
}

# Heuristic: an all-black (or near-black) frame means the monitor was off, not a capture error.
function Test-BlankImage($bmp) {
    $w = $bmp.Width
    $h = $bmp.Height
    if ($w -lt 8 -or $h -lt 8) { return $false }
    $stepX = [Math]::Max(1, [int]($w / 40))
    $stepY = [Math]::Max(1, [int]($h / 40))
    $total = 0
    $lit = 0
    for ($y = 0; $y -lt $h; $y += $stepY) {
        for ($x = 0; $x -lt $w; $x += $stepX) {
            $p = $bmp.GetPixel($x, $y)
            $total++
            if (($p.R + $p.G + $p.B) -gt 24) { $lit++ }
        }
    }
    return ($total -gt 0 -and ($lit / $total) -lt 0.02)
}

# ---------- 1) wait for the desktop to be unlocked ----------
$canLive = $true
if (-not $NoWaitUnlock -and (Test-DesktopLocked)) {
    if (-not (Wait-DesktopUnlocked $UnlockTimeoutSec)) {
        $canLive = $false
        Write-Warning 'desktop is still locked; capturing an offscreen snapshot instead'
    }
}

# ---------- 2) make sure the widget is running ----------
$win = $null
if ($canLive) {
    $win = Get-HokiWindow
    if (-not $win -and -not $NoLaunch) {
        Write-Host 'widget is not running; starting it ...'
        $win = Start-WidgetWindow $Widget $WindowTimeoutSec $SettleSeconds
    }
}

# ---------- 3) capture the live screen ----------
$captured = 'snapshot'
if ($canLive -and $win) {
    $bmp = $null
    try {
        $bmp = Get-LiveCapture $win.Rect
        if (-not (Test-BlankImage $bmp)) {
            $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
            $captured = 'live'
        } else {
            Write-Warning 'live capture looks blank (monitor off?); using an offscreen snapshot'
        }
    } catch {
        Write-Warning "live capture failed ($($_.Exception.Message)); using an offscreen snapshot"
    } finally {
        if ($bmp) { $bmp.Dispose() }
    }
}

# ---------- 4) offscreen snapshot fallback ----------
if ($captured -ne 'live') {
    $cmd = '-NoProfile -STA -ExecutionPolicy Bypass -File "' + $Widget + '" -Snapshot "' + $Out + '" -SnapshotSize Large'
    $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $cmd -Wait -PassThru
    if (($proc.ExitCode -ne 0) -or (-not (Test-Path $Out))) {
        throw "capture failed (live window not available and offscreen snapshot failed)"
    }
    $captured = 'snapshot'
}

# ---------- 5) report ----------
$img = [System.Drawing.Image]::FromFile($Out)
Write-Host ('Hoki capture -> ' + $Out)
Write-Host (('  mode={0}  {1}x{2}px  {3} bytes' -f $captured, $img.Width, $img.Height, (Get-Item $Out).Length))
$img.Dispose()
