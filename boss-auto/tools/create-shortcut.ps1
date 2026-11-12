# 在桌面创建「BOSS 自动投递」快捷方式（双击即可打开本地控制台）
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\create-shortcut.ps1
param(
  [string]$Root = "",
  [string]$Name = "BOSS 自动投递"
)
$ErrorActionPreference = "Stop"
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$vbs = Join-Path $Root "launch-ui.vbs"
if (-not (Test-Path -LiteralPath $vbs)) { throw "missing $vbs" }

$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "$Name.lnk"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$sc.Arguments = "`"$vbs`""
$sc.WorkingDirectory = $Root
$sc.Description = "BOSS直聘自动投递控制台（本地运行）"
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (Test-Path -LiteralPath $edge) { $sc.IconLocation = "$edge,0" }
$sc.Save()
Write-Output "desktop shortcut created: $lnk"
