' boss-auto desktop launcher（可移植版）
' 用脚本自身位置定位目录，避免 VBS 以 ANSI 读取中文路径时乱码。
Option Explicit
Dim fso, sh, here, node, target
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)

' 优先用 PATH 里的 node；找不到就退回常见安装位置
node = ""
Dim probe, code
probe = sh.Exec("cmd /c where node")
If Not probe.StdOut.AtEndOfStream Then node = Trim(probe.StdOut.ReadLine())
If node = "" Then
  If fso.FileExists("C:\Program Files\nodejs\node.exe") Then node = "C:\Program Files\nodejs\node.exe"
End If
If node = "" Then
  MsgBox "找不到 node.exe，请先安装 Node.js（https://nodejs.org）", 48, "BOSS 自动投递"
  WScript.Quit 1
End If

target = """" & node & """ """ & here & "\ui\server.mjs"""
sh.CurrentDirectory = here
sh.Run target, 0, False
