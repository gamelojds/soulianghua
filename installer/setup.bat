@echo off
title SouLianghua 量化交易系统 - 安装程序
chcp 65001 >nul
color 0A

echo.
echo   ╔══════════════════════════════════════════╗
echo   ║     SouLianghua 量化交易系统 v1.0        ║
echo   ║     多策略量化交易平台安装程序            ║
echo   ╚══════════════════════════════════════════╝
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo   [提示] 建议以管理员身份运行以获得最佳体验
    echo.
)

set "INSTALL_DIR=%LOCALAPPDATA%\SouLianghua"
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\SouLianghua"

echo   [1/4] 正在安装到 %INSTALL_DIR%...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
copy /y "%~dp0SouLianghua.exe" "%INSTALL_DIR%\SouLianghua.exe" >nul 2>&1
if %errorlevel% neq 0 (
    echo   [错误] 复制文件失败，请检查权限
    pause
    exit /b 1
)
echo   [✓]  文件复制完成

echo   [2/4] 创建开始菜单快捷方式...
if not exist "%START_MENU%" mkdir "%START_MENU%"

:: 创建快捷方式的 VBS 脚本
set "vbs=%TEMP%\create_shortcuts.vbs"
(
echo Set WshShell = WScript.CreateObject("WScript.Shell"^)
echo Set Shortcut = WshShell.CreateShortcut("%START_MENU%\SouLianghua.lnk"^)
echo Shortcut.TargetPath = "%INSTALL_DIR%\SouLianghua.exe"
echo Shortcut.WorkingDirectory = "%INSTALL_DIR%"
echo Shortcut.Description = "SouLianghua - 多策略量化交易系统"
echo Shortcut.IconLocation = "%INSTALL_DIR%\SouLianghua.exe,0"
echo Shortcut.Save(^)
echo.
echo Set Shortcut2 = WshShell.CreateShortcut("%DESKTOP_DIR%\SouLianghua.lnk"^)
echo Shortcut2.TargetPath = "%INSTALL_DIR%\SouLianghua.exe"
echo Shortcut2.WorkingDirectory = "%INSTALL_DIR%"
echo Shortcut2.Description = "SouLianghua - 多策略量化交易系统"
echo Shortcut2.IconLocation = "%INSTALL_DIR%\SouLianghua.exe,0"
echo Shortcut2.Save(^)
echo.
echo Set Shortcut3 = WshShell.CreateShortcut("%START_MENU%\卸载 SouLianghua.lnk"^)
echo Shortcut3.TargetPath = "cmd.exe"
echo Shortcut3.Arguments = "/c rmdir /s /q ""%INSTALL_DIR%"" ^&^& rmdir /s /q ""%START_MENU%"" ^&^& del /q ""%DESKTOP_DIR%\SouLianghua.lnk"""
echo Shortcut3.Description = "卸载 SouLianghua"
echo Shortcut3.Save(^)
) > "%vbs%"

cscript //nologo "%vbs%" >nul 2>&1
del "%vbs%" >nul 2>&1
echo   [✓]  快捷方式创建完成

echo   [3/4] 注册防火墙例外...
netsh advfirewall firewall add rule name="SouLianghua" dir=in action=allow program="%INSTALL_DIR%\SouLianghua.exe" enable=yes >nul 2>&1
echo   [✓]  防火墙配置完成

echo   [4/4] 安装完成！
echo.
echo   ╔══════════════════════════════════════════╗
echo   ║   SouLianghua 安装成功！                 ║
echo   ║   桌面已创建快捷方式，双击即可启动        ║
echo   ║   访问地址: http://localhost:8520         ║
echo   ╚══════════════════════════════════════════╝
echo.
echo   是否立即启动 SouLianghua？
choice /c yn /m "[Y] 启动  [N] 稍后"
if %errorlevel% equ 1 start "" "%INSTALL_DIR%\SouLianghua.exe"

pause
