# Image de production de Vidéo Studio (serveur + application web).
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY video-studio ./video-studio
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.mjs"]
