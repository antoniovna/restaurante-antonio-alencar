FROM node:18-alpine

WORKDIR /app

# Copia só dependências primeiro (cache eficiente)
COPY package*.json ./

RUN npm install --omit=dev

# Copia o resto da aplicação
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]