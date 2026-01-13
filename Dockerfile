# syntax=docker/dockerfile:1.6

# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Кэшируем npm, чтобы быстрее собираться при повторных билдах
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- build (prod) ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# sanity-check, как и раньше
RUN test -f dist/main.js && test -f dist/app.module.js || \
    (echo "dist/main.js или dist/app.module.js отсутствует. Содержимое dist:"; \
     find dist -maxdepth 2 -type f; exit 1)

# ---------- runner (prod) ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps"
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER app
EXPOSE 3002
CMD ["node", "dist/main.js"]

# ---------- dev (hot-reload) ----------
FROM node:24-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
EXPOSE 3002
CMD ["npm", "run", "start:dev"]