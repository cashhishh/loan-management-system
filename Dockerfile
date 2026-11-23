# Single deployable image: builds the React app and serves it from the Express API.

# ---- build the frontend ----
FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- runtime: API + static frontend ----
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app/backend
ENV NODE_ENV=production

COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/src ./src
COPY --from=web /app/frontend/dist /app/frontend/dist

EXPOSE 4000
# Apply migrations, make sure demo accounts exist, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"]
