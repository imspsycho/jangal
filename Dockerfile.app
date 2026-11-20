# ---------- Stage 1: build the frontend ----------
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: backend + static ----------
FROM node:20-alpine AS app
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN apk add --no-cache python3 make g++ \
 && npm install --no-audit --no-fund \
 && apk del python3 make g++ || true
COPY backend/ ./
COPY --from=web /web/dist ./public
EXPOSE 3000
CMD ["node", "src/index.js"]
