@echo off
REM Mantiene el backend de CBF ERP corriendo siempre: si el proceso node se
REM cierra por cualquier razon (crash, error no manejado), lo vuelve a
REM levantar despues de 5 segundos. Pensado para correr como tarea
REM programada de Windows al iniciar la computadora (ver ops/README.md).
cd /d "%~dp0..\backend"
if not exist "%~dp0logs" mkdir "%~dp0logs"
set LOGFILE=%~dp0logs\backend.log

:loop
echo [%date% %time%] Iniciando backend CBF ERP... >> "%LOGFILE%"
node dist\server.js >> "%LOGFILE%" 2>&1
echo [%date% %time%] El backend se detuvo - reintentando en 5 segundos... >> "%LOGFILE%"
timeout /t 5 /nobreak >nul
goto loop
