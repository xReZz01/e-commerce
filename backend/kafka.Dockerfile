FROM wurstmeister/kafka:latest

# Copiar el archivo server.properties
COPY ./config/server.properties /opt/kafka/config/server.properties
