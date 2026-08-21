@echo off
REM Ambiente de pruebas (bloque de arquitectura, 20-ago-2026): segunda
REM instancia del sistema, en la misma computadora, puerto y base de datos
REM totalmente separados de produccion (puerto 4000, cbf_erp) -- para
REM probar cambios de codigo antes de tocar lo que se usa a diario. No se
REM programa como tarea automatica de Windows (a diferencia de
REM run-backend.bat) -- se levanta a mano cuando se va a probar algo.
REM
REM La base de datos de pruebas (cbf_erp_pruebas) se llena con el ultimo
REM respaldo real -- ver refrescar-bd-pruebas.bat para regenerarla antes de
REM cada ronda de pruebas, nunca con datos inventados.
REM
REM PORT/DATABASE_URL/JWT_SECRET viven en backend\.env.pruebas (no en este
REM archivo -- ese si esta en git, y no debe llevar contrasenas).
cd /d "%~dp0..\backend"
if not exist "%~dp0logs" mkdir "%~dp0logs"
set LOGFILE=%~dp0logs\backend-pruebas.log

for /f "usebackq tokens=1,* delims==" %%A in (".env.pruebas") do set %%A=%%B

echo [%date% %time%] Iniciando backend de PRUEBAS (puerto %PORT%, BD cbf_erp_pruebas)... >> "%LOGFILE%"
node dist\server.js >> "%LOGFILE%" 2>&1
echo [%date% %time%] Backend de pruebas detenido. >> "%LOGFILE%"
