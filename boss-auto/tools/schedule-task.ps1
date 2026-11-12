# 注册/删除 Windows 计划任务：每天 09:35、19:35 自动跑一轮
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedule-task.ps1 -Action install
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedule-task.ps1 -Action remove
param(
  [string]$Action = "install",
  [string]$Root = ""
)
$ErrorActionPreference = "Stop"
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$names = @("Boss-Auto-Apply-AM", "Boss-Auto-Apply-PM")

if ($Action -eq "remove") {
  foreach ($n in $names) {
    try { Unregister-ScheduledTask -TaskName $n -Confirm:$false; Write-Output "removed: $n" }
    catch { Write-Output "not found: $n" }
  }
  exit 0
}

$cmd = Join-Path $Root "run-daily.cmd"
if (-not (Test-Path -LiteralPath $cmd)) { throw "missing $cmd" }
$taskAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ('/c "' + $cmd + '"') -WorkingDirectory $Root
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
  -ExecutionTimeLimit ([TimeSpan]::FromHours(2)) -MultipleInstances IgnoreNew

$plan = @(
  @{ name = $names[0]; at = "09:35" },
  @{ name = $names[1]; at = "19:35" }
)
foreach ($p in $plan) {
  $trigger = New-ScheduledTaskTrigger -Daily -At $p.at
  Register-ScheduledTask -TaskName $p.name -Action $taskAction -Trigger $trigger -Settings $settings -Force `
    -Description "BOSS auto apply + track (runs only when you are logged on)" | Out-Null
  Write-Output ("installed: " + $p.name + " daily " + $p.at)
}
Write-Output "list:   Get-ScheduledTask -TaskName 'Boss-Auto-*'"
Write-Output 'remove: powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedule-task.ps1 -Action remove'
