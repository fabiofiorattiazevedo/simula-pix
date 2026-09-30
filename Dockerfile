# =============================================================================
# Dockerfile — PIX Payment API (desenvolvimento)
# =============================================================================

FROM node:20-alpine

WORKDIR /app

# Copia apenas os arquivos de dependências primeiro para aproveitar o cache de camadas
COPY package*.json ./

RUN npm install

# Copia o restante do código (sobrescrito pelo volume em dev, mas necessário para o build)
COPY . .

EXPOSE 3000

# Usa nodemon para hot reload em desenvolvimento
CMD ["npm", "run", "dev"]
