@echo off
chcp 65001 >nul
title Controle de Veiculos
cd /d "%~dp0"

set MODO=%1
if "%MODO%"=="" set MODO=dev

if /i "%MODO%"=="prod" goto PROD
if /i "%MODO%"=="dev" goto DEV
echo Uso: iniciar.bat [dev^|prod]
echo   dev  - roda local com Node.js (padrao)
echo   prod - roda com Docker (docker compose)
pause
exit /b 1

:DEV
echo ==========================================
echo    CONTROLE DE VEICULOS - MODO DEV LOCAL
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado!
    echo Instale em: https://nodejs.org/ ^(versao 18 ou superior^)
    pause
    exit /b 1
)
echo [OK] Node.js:
node --version

if not exist ".env" (
    echo.
    echo [AVISO] Arquivo .env nao encontrado. Criando a partir do .env.example...
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [ACAO] Edite o arquivo .env com a senha do seu MySQL antes de continuar.
        notepad ".env"
    ) else (
        echo [ERRO] .env.example nao encontrado. Crie o .env manualmente.
        pause
        exit /b 1
    )
)

if not exist "node_modules\" (
    echo.
    echo [..] Instalando dependencias ^(primeira execucao^)...
    call npm install
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo.
echo ==========================================
echo    Iniciando o servidor (dev)...
echo    Acesse: http://localhost:3000
echo    Para parar: feche esta janela ou Ctrl+C
echo ==========================================
echo.
start "" "http://localhost:3000"
call npm start
pause
exit /b 0

:PROD
echo ==========================================
echo    CONTROLE DE VEICULOS - MODO PROD DOCKER
echo ==========================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Docker nao encontrado!
    echo Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)
echo [OK] Docker:
docker --version

if not exist ".env" (
    echo.
    echo [AVISO] Arquivo .env nao encontrado. Criando a partir do .env.example...
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [ACAO] Edite o arquivo .env com as senhas de producao antes de continuar.
        notepad ".env"
    ) else (
        echo [ERRO] .env.example nao encontrado. Crie o .env manualmente.
        pause
        exit /b 1
    )
)

echo.
echo [..] Subindo containers (app + MySQL + GPS)...
docker compose up --build -d
if errorlevel 1 (
    echo [ERRO] Falha ao subir os containers.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo    Sistema no ar!
echo    HTTPS: https://localhost:3070
echo    Logs:  docker compose logs -f
echo    Parar: docker compose down
echo ==========================================
start "" "https://localhost:3070"
pause
exit /b 0
