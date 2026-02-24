#  Node.js
FROM node:18

# Defina o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copie arquivos  instalar dependências
COPY package*.json ./

# Instale as dependências do projeto
RUN npm install

# Copie o restante dos arquivos para o contêiner
COPY . .

# 3000 para o host
EXPOSE 3000

# iniciar o servidor
CMD ["node", "app.js"]

# Garante a pasta de sessões e permissões 
RUN mkdir -p /app/.sessions && chmod 700 /app/.sessions
