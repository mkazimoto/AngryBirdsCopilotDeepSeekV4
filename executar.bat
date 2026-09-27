@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js nao encontrado.
  echo   Instale em https://nodejs.org  ^(ou abra o index.html direto no navegador^).
  echo.
  pause
  exit /b 1
)

echo.
echo   Iniciando o servidor do Angry Birds...
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:5173/"

node servidor.js
