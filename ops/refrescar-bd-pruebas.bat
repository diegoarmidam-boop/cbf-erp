@echo off
REM Ambiente de pruebas (bloque de arquitectura, 20-ago-2026): recrea
REM cbf_erp_pruebas desde cero con el ultimo respaldo REAL (nunca datos
REM inventados) -- correr esto antes de cada ronda de pruebas para que
REM reflejen la operacion real. Detiene el backend de pruebas antes (si
REM esta corriendo) porque MySQL no deja tirar una base de datos con
REM conexiones activas.
setlocal enabledelayedexpansion

set MYSQL="C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe"
set BACKUP_DIR=C:\Users\Chula Brand\Desktop\proyecto diego\CBF-ERP-Backups

REM Encuentra el respaldo mas reciente (el nombre trae fecha-hora, así que
REM ordenar por nombre es igual a ordenar por fecha).
set ULTIMO=
for /f "delims=" %%F in ('dir /b /o-n "%BACKUP_DIR%\cbf_erp_*.sql"') do (
  if not defined ULTIMO set ULTIMO=%%F
)
if not defined ULTIMO (
  echo No se encontro ningun respaldo en "%BACKUP_DIR%".
  exit /b 1
)
echo Usando respaldo: %ULTIMO%

echo Recreando base de datos cbf_erp_pruebas...
%MYSQL% -u root -proot -e "DROP DATABASE IF EXISTS cbf_erp_pruebas; CREATE DATABASE cbf_erp_pruebas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if errorlevel 1 (
  echo No se pudo recrear la base de datos -- si el backend de pruebas esta corriendo, detenlo primero.
  exit /b 1
)

REM Quita el bloque SET @@GLOBAL.GTID_PURGED del dump (dos lineas, con
REM comilla de cierre en la siguiente) -- restaurar en el MISMO servidor de
REM origen choca contra el historial de GTID ya existente si se deja.
set TEMP_SQL=%TEMP%\cbf_erp_pruebas_restore.sql
powershell -NoProfile -Command "(Get-Content -Raw '%BACKUP_DIR%\%ULTIMO%') -replace '(?ms)^SET @@GLOBAL\.GTID_PURGED=.*?'';\r?\n', '' | Set-Content -NoNewline '%TEMP_SQL%'"

echo Restaurando...
%MYSQL% -u root -proot cbf_erp_pruebas < "%TEMP_SQL%"
if errorlevel 1 (
  echo Fallo la restauracion.
  del "%TEMP_SQL%" >nul 2>&1
  exit /b 1
)
del "%TEMP_SQL%" >nul 2>&1

REM El respaldo trae los DATOS al momento en que se genero -- si el codigo
REM ya tiene migraciones mas nuevas que ese respaldo (como esta misma,
REM 20260820234141_modulo_config_switch), el esquema se queda desactualizado
REM sin este paso. Mismo mecanismo que produccion (prisma migrate deploy),
REM solo que aqui contra la base de datos de pruebas.
echo Aplicando migraciones pendientes...
cd /d "%~dp0..\backend"
set DATABASE_URL=mysql://root:root@localhost:3306/cbf_erp_pruebas
call npx prisma migrate deploy
if errorlevel 1 (
  echo Fallaron las migraciones -- revisa el mensaje de arriba.
  exit /b 1
)

echo Listo -- cbf_erp_pruebas actualizada desde %ULTIMO%, con el esquema al corriente.
echo Recuerda: si el backend de pruebas ya estaba corriendo, reinicialo para que tome los datos nuevos.
