@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NODE=node
where node >nul 2>&1 || set NODE=C:\Program Files\nodejs\node.exe
echo ==== %date% %time% start ==== >> data\run.log
"%NODE%" src\apply.mjs >> data\run.log 2>&1
"%NODE%" src\track.mjs >> data\track.log 2>&1
"%NODE%" src\report.mjs >> data\run.log 2>&1
echo ==== %date% %time% end ==== >> data\run.log
