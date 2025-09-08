# Use uma imagem Node.js oficial como base
FROM node:18-alpine

# Defina o diretório de trabalho dentro do container
WORKDIR /app

# Copie o package.json e package-lock.json
COPY package*.json ./

# Instale as dependências
RUN npm install

# Copie o restante dos arquivos da aplicação
COPY . .

# Crie o diretório para o banco de dados e uploads
RUN mkdir -p ./database && mkdir -p ./public/uploads

# Exponha a porta que o aplicativo usará
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["sh", "-c", "node init-db.js && node app.js"]