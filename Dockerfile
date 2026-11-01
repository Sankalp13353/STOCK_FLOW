# ==========================================
# STAGE 1: Builder
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules and Prisma engine
RUN apk add --no-cache openssl python3 make g++

# Install all dependencies (including devDependencies for build & types)
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

# Copy source and configuration
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# Remove development dependencies to keep production footprint minimal
RUN npm prune --omit=dev

# ==========================================
# STAGE 2: Production Runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /home/node/app

# Install tini for reliable PID 1 signal handling & openssl for Prisma runtime
RUN apk add --no-cache tini openssl wget

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

# Copy dependencies, compiled dist, and prisma schemas from builder
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma

# Use non-root node user for container security
USER node

# Expose HTTP port
EXPOSE 4000

# Signal handling via tini
ENTRYPOINT ["/sbin/tini", "--"]

# Default command: start HTTP API Server (can be overridden by worker in compose)
CMD ["node", "dist/server.js"]

