# Hoki hero capture - unlock watcher
# -----------------------------------------------------------------------------
# Keeps the Hoki README hero (docs/media/desktop-widget.png) LIVE and up to date
# with ZERO user clicks.
#
# What it does
#   Runs resident in the background (started by the Task Scheduler job
#   "Hoki_HeroCapture" at logon). It polls the Windows lock state and, on each
#   locked -> unlocked transition, refreshes the hero:
#       tools\capture_hoki.ps1 -Publish
#   which ensures the widget window is present, captures the live region, and
#   commits + pushes the changed hero image.
#
# Why a watcher and not just an "At log on" capture?
#   Task Scheduler's "At log on" only fires on a fresh logon, NOT on each
#   Win+L lock -> unlock of the same session. This watcher detects the actual
#   unlock transition, so the hero refreshes whenever Juwen sits back down.
#   No admin, no Security-log audit, no extra dependencies.
#
# Safety / behaviour
#   - Single instance (mutex Local\HokiHeroWatcher) so a re-fired logon task
#     never stacks a second watcher.
#   - Runs only in the interactive (logged-on) session; it can do nothing while
#     the desktop is locked (by design - it waits for the unlock).
#   - Debounced: at most one capture per -MinCaptureIntervalMinutes, so rapid
#     lock/unlock cycles do not flood the git history with tiny hero commits.
#   - Every run appends a timestamped line to %APPDATA%\Hoki\watcher.log.
#
# Usage (normally launched by Task Scheduler, not by hand):
#   powershell -NoProfile -STA -ExecutionPolicy Bypass -File tools\hoki_widget_watcher.ps1
#
# Remove the whole setup:
#   Unregister-ScheduledTask -TaskName Hoki_HeroCapture
#   (and stop any running watcher: stop the powershell process whose command
#    line contains hoki_widget_watcher.ps1)
# -----------------------------------------------------------------------------
param(
  [string]$Capture = (Join-Path $PSScriptRoot 'capture_hoki.ps1'),
  [int]$PollSeconds = 10,                    # how often to re-check the lock state
  [int]$SettleSeconds = 6,                   # wait this long after unlock before capturing
  [int]$MinCaptureIntervalMinutes = 10,      # debounce between captures
  [switch]$NoCaptureAtStart                  # skip the one-time capture on startup
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# --- logging -----------------------------------------------------------------
$logDir = Join-Path $env:APPDATA 'Hoki'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir 'watcher.log'
function Write-Log([string]$msg) {
  $line = ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Output $line
}

# --- single instance ---------------------------------------------------------
$mutex = New-Object System.Threading.Mutex($false, 'Local\HokiHeroWatcher')
if (-not $mutex.WaitOne(0)) {
  Write-Log 'already running - this instance exits.'
  exit 0
}

# --- guard -------------------------------------------------------------------
if (-not (Test-Path $Capture)) {
  Write-Log "ERROR: capture script not found at $Capture - exiting."
  exit 1
}

# --- DPI + lock detection ----------------------------------------------------
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class HokiWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, ref uint c, uint d);
}
"@
[void][HokiWin]::SetProcessDPIAware()

function Get-IsLocked {
  $v = 0
  [void][HokiWin]::SystemParametersInfo(0x00A2, 0, [ref]$v, 0)   # SPI_GETSCREENSAVERRUNNING
  return ($v -ne 0)
}

# --- capture helper (hidden child, waits, returns exit code) -----------------
# The child's stdout/stderr are redirected to temp files and echoed into
# watcher.log, so the -Publish result (pushed / unchanged / add|commit|push
# failed) is visible even though the child runs hidden.
function Invoke-Capture {
  $arg = '-NoProfile -STA -ExecutionPolicy Bypass -File "{0}" -Publish' -f $Capture
  $capOut = Join-Path $env:TEMP ('hoki_cap_{0}.out' -f $PID)
  $capErr = Join-Path $env:TEMP ('hoki_cap_{0}.err' -f $PID)
  foreach ($f in @($capOut, $capErr)) { if (Test-Path $f) { Remove-Item $f -Force } }
  $proc = Start-Process powershell.exe -ArgumentList $arg -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $capOut -RedirectStandardError $capErr
  $code = $proc.ExitCode
  foreach ($f in @($capOut, $capErr)) {
    if (Test-Path $f) {
      foreach ($line in (Get-Content $f)) { Write-Log ('    | ' + $line) }
      Remove-Item $f -Force
    }
  }
  return $code
}

Write-Log ('Hoki watcher started  capture={0}  poll={1}s  settle={2}s  min-interval={3}m' -f $Capture, $PollSeconds, $SettleSeconds, $MinCaptureIntervalMinutes)

$lastCapture = [DateTime]::MinValue

# One-time capture on startup (refreshes the hero on each logon too).
if (-not $NoCaptureAtStart) {
  Write-Log ('startup: settling {0}s then doing an initial capture...' -f $SettleSeconds)
  Start-Sleep -Seconds $SettleSeconds
  if (-not (Get-IsLocked)) {
    $code = Invoke-Capture
    $lastCapture = Get-Date
    Write-Log ('startup capture done (exit {0}).' -f $code)
  } else {
    Write-Log 'startup: desktop is locked - will capture on the first unlock instead.'
  }
}

# --- main loop: watch for the locked -> unlocked transition ------------------
$prevLocked = Get-IsLocked
Write-Log ('watching for unlocks (current locked={0}).' -f $prevLocked)
while ($true) {
  Start-Sleep -Seconds $PollSeconds
  try {
    $locked = Get-IsLocked
    $justUnlocked = ($prevLocked -and -not $locked)   # locked -> unlocked
    $prevLocked = $locked

    if ($justUnlocked) {
      $since = ((Get-Date) - $lastCapture).TotalMinutes
      if ($since -lt $MinCaptureIntervalMinutes) {
        Write-Log ('unlock, but only {0}m since last capture (< {1}m) - skipping.' -f [int]$since, $MinCaptureIntervalMinutes)
        continue
      }
      Write-Log ('unlock detected; settling {0}s then capturing...' -f $SettleSeconds)
      Start-Sleep -Seconds $SettleSeconds
      if (Get-IsLocked) { Write-Log 'skipped - desktop locked again before the settle finished.'; continue }
      $code = Invoke-Capture
      $lastCapture = Get-Date
      Write-Log ('capture done (exit {0}).' -f $code)
    }
  } catch {
    # Never let a transient error kill the resident watcher.
    Write-Log ('loop error: ' + $_.Exception.Message)
    Start-Sleep -Seconds 5
  }
}
