# Imagem de produção — Controle de Veículos
FROM node:18-slim

ENV NODE_ENV=production
WORKDIR /app

# Dependências primeiro (melhor uso de cache de camadas)
COPY package*.json ./
RUN npm install --omit=dev

# Código da aplicação (node_modules, .env, uploads e sessões ficam de fora via .dockerignore)
COPY . .

# Pasta de sessões com permissão restrita
RUN mkdir -p /app/.sessions && chmod 700 /app/.sessions

EXPOSE 3000

# Healthcheck simples: respondeu /login = app no ar
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/login', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "app.js"]
