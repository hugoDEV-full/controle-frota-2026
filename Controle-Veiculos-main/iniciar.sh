#!/usr/bin/env bash
# Inicializador do Controle de Veículos
# Uso: ./iniciar.sh [dev|prod]
#   dev  - roda local com Node.js (padrão)
#   prod - roda com Docker (docker compose)

set -e
cd "$(dirname "$0")"

MODO="${1:-dev}"

if [ "$MODO" = "prod" ]; then
  echo "=========================================="
  echo "   CONTROLE DE VEÍCULOS - MODO PROD DOCKER"
  echo "=========================================="

  if ! command -v docker >/dev/null 2>&1; then
    echo "[ERRO] Docker não encontrado! Instale: https://docs.docker.com/get-docker/"
    exit 1
  fi
  docker --version

  if [ ! -f .env ]; then
    echo "[AVISO] .env não encontrado. Criando a partir do .env.example..."
    cp .env.example .env
    echo "[AÇÃO] Edite o .env com as senhas de produção e rode novamente."
    exit 1
  fi

  echo "[..] Subindo containers (app + MySQL + GPS)..."
  docker compose up --build -d

  echo "=========================================="
  echo "   Sistema no ar!"
  echo "   HTTPS: https://localhost:3070"
  echo "   Logs:  docker compose logs -f"
  echo "   Parar: docker compose down"
  echo "=========================================="
  exit 0
fi

if [ "$MODO" != "dev" ]; then
  echo "Uso: ./iniciar.sh [dev|prod]"
  exit 1
fi

echo "=========================================="
echo "   CONTROLE DE VEÍCULOS - MODO DEV LOCAL"
echo "=========================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js não encontrado! Instale a versão 18 ou superior: https://nodejs.org/"
  exit 1
fi
echo "[OK] Node.js: $(node --version)"

if [ ! -f .env ]; then
  echo "[AVISO] .env não encontrado. Criando a partir do .env.example..."
  cp .env.example .env
  echo "[AÇÃO] Edite o .env com a senha do seu MySQL e rode novamente."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[..] Instalando dependências (primeira execução)..."
  npm install
fi

echo "=========================================="
echo "   Iniciando o servidor (dev)..."
echo "   Acesse: http://localhost:3000"
echo "   Para parar: Ctrl+C"
echo "=========================================="
npm start
