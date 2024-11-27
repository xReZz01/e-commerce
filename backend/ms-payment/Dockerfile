# Usa una imagen base de Node.js
FROM node:14

# Establece el directorio de trabajo en /app
WORKDIR /app

# Copia el package.json y el package-lock.json
COPY package.json package-lock.json ./

# Instala las dependencias
RUN npm install

# Instala nodemon globalmente
RUN npm install -g nodemon

# Copia el resto de la aplicación
COPY . .

# Expone el puerto en el que la aplicación correrá
EXPOSE 4003

# Define el comando para correr la aplicación
CMD ["npm","run","dev"]