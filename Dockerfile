# -----------------------------------------------------------------------------
# Build Stage
# This stage installs all dependencies and builds both frontend and server
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install libsecret library required by keytar native module
RUN apk add --no-cache libsecret

# Set working directory
WORKDIR /app

# Copy package files for all workspaces
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY server/package*.json ./server/

# Install all dependencies
RUN npm ci

# Copy source files
COPY frontend ./frontend
COPY server ./server

# Build frontend only (skip server TypeScript build)
# Run vite build directly to skip vue-tsc type checking
RUN cd frontend && npx vite build && cd ..

# -----------------------------------------------------------------------------
# Production Stage
# This stage creates a minimal image with only production dependencies and
# built artifacts
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install libsecret library required by keytar native module
RUN apk add --no-cache libsecret

# Set working directory
WORKDIR /app

# Set default port
ENV PORT=3001

# Copy package files for production dependency installation
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY server/package*.json ./server/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built frontend artifacts and server source from builder stage
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/server/src ./server/src
COPY --from=builder /app/server/package.json ./server/

# Expose the server port
EXPOSE 3001

# Start the server using tsx to run TypeScript directly
CMD ["npx", "tsx", "server/src/index.ts"]
