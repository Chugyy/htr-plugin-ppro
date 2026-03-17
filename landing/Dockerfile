# --- Stage 1: Install dependencies ---
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++ gcc
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ gcc
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Stage 3: Production ---
FROM node:20-alpine AS runner
RUN apk add --no-cache python3 make g++ gcc
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# ADMIN_API_KEY must be passed at runtime via -e or .env

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

# Build: docker build -t htr-landing:latest .
# Run:   docker run -d --restart unless-stopped -p 3000:3000 -v landing_data:/app/data htr-landing:latest
CMD ["node", "server.js"]
