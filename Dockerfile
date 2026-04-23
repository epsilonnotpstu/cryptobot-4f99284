FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    SERVE_STATIC=true \
    AUTH_DATA_DIR=/data

RUN mkdir -p /data

EXPOSE 4000

CMD ["npm", "run", "server:start"]
