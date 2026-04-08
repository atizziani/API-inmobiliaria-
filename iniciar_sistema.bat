@echo off
echo =========================================
echo    INICIANDO PLATAFORMA COLDWELL BANKER
echo =========================================
echo.

echo [1/2] Levantando la API (Backend)...
start cmd /k "title API Backend && cd coldwell-banker-api && npm run dev"

echo [2/2] Levantando la Web (Frontend)...
start cmd /k "title Web Frontend && cd coldwell-banker-web && npm run dev"

echo.
echo =========================================
echo Todo iniciado en nuevas ventanas de consola!
echo El frontend deberia abrirse pronto o podes acceder a: http://localhost:5173
echo =========================================
pause
