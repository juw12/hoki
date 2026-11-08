# Hoki hero capture - install / uninstall the on-unlock Task Scheduler job
# -----------------------------------------------------------------------------
# Registers a background Windows Task Scheduler job that keeps the Hoki README
# hero (docs/media/desktop-widget.png) live with ZERO clicks:
#
#   Task : Hoki_HeroCapture
#   When : At log on (current user), interactive session, no admin
#   Does : starts tools\hoki_widget_watcher.ps1, which watches for the desktop
#          unlocking and, on each unlock (debounced), runs
#          tools\capture_hoki.ps1 -Publish  (live capture -> commit -> push).
#
# Install (re-run any time; idempotent):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\install_hoki_capture_task.ps1
#
# Uninstall (removes the task + stops any running watcher):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\install_hoki_capture_task.ps1 -Uninstall
# -----------------------------------------------------------------------------
param(
  [string]$TaskName = 'Hoki_HeroCapture',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$watcher = Join-Path $PSScriptRoot 'hoki_widget_watcher.ps1'
$user = $env:USERNAME

if ($Uninstall) {
  Write-Output ('{0}  uninstalling task "{1}"...' -f (Get-Date -Format 'HH:mm:ss'), $TaskName)
  Get-Process powershell -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*hoki_widget_watcher.ps1*' } |
    ForEach-Object { Write-Output ('  stopping watcher pid {0}' -f $_.Id); Stop-Process -Id $_.Id -Force }
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  Write-Output '  done. (The watcher and capture scripts are left in place.)'
  exit 0
}

if (-not (Test-Path $watcher)) { Write-Output "ERROR: watcher not found at $watcher"; exit 1 }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $watcher)

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
Write-Output ('{0}  installed task "{1}" (state={2})' -f (Get-Date -Format 'HH:mm:ss'), $TaskName, $t.State)
Write-Output '  when : at log on (current user, interactive session, no admin)'
Write-Output ('  does : start the unlock watcher -> capture_hoki.ps1 -Publish on each unlock (debounced)')
Write-Output ('  log  : %APPDATA%\Hoki\watcher.log')
Write-Output "  remove : re-run this script with -Uninstall"
