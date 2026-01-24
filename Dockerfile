# Multi-stage Dockerfile for ST-CardGen
# Supports: linux/amd64, linux/arm64

# Build arguments for versioning and metadata
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=dev
ARG REPO_URL

# Build frontend (use full node for simplicity, as no native deps)
FROM --platform=$BUILDPLATFORM node:20 AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Build server (alpine with build deps for keytar)
# Note: We use the target platform here for native modules
FROM node:20-alpine AS server-build
RUN apk add --no-cache python3 make g++ pkgconfig libsecret-dev
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/ ./server/
RUN cd server && npm run build

# Production image
FROM node:20-alpine

# Re-declare ARGs after FROM
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=dev
ARG REPO_URL

# OCI image labels
LABEL org.opencontainers.image.title="ST-CardGen" \
      org.opencontainers.image.description="Character card generator for SillyTavern" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="${REPO_URL}" \
      org.opencontainers.image.licenses="MIT"

# Install runtime dependencies
RUN apk add --no-cache libsecret curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy server from build (node_modules includes built natives)
COPY --from=server-build --chown=nodejs:nodejs /app/server ./server

# Copy frontend dist
COPY --from=frontend-build --chown=nodejs:nodejs /app/frontend/dist ./frontend/dist

# Create directories for persistent data with correct ownership
RUN mkdir -p /app/server/data /app/server/output && \
    chown -R nodejs:nodejs /app/server/data /app/server/output

# Expose port
EXPOSE 3001

# Set working dir to server
WORKDIR /app/server

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Environment defaults
ENV NODE_ENV=production \
    PORT=3001

# Create entrypoint script to fix permissions
RUN mkdir -p /usr/local/bin && \
    echo '#!/bin/sh' > /usr/local/bin/entrypoint.sh && \
    echo 'set -e' >> /usr/local/bin/entrypoint.sh && \
    echo '# Fix permissions for mounted volumes' >> /usr/local/bin/entrypoint.sh && \
    echo 'if [ -d /app/server/data ]; then' >> /usr/local/bin/entrypoint.sh && \
    echo '  chown -R nodejs:nodejs /app/server/data 2>/dev/null || true' >> /usr/local/bin/entrypoint.sh && \
    echo 'fi' >> /usr/local/bin/entrypoint.sh && \
    echo 'if [ -d /app/server/output ]; then' >> /usr/local/bin/entrypoint.sh && \
    echo '  chown -R nodejs:nodejs /app/server/output 2>/dev/null || true' >> /usr/local/bin/entrypoint.sh && \
    echo 'fi' >> /usr/local/bin/entrypoint.sh && \
    echo '# Execute the main command' >> /usr/local/bin/entrypoint.sh && \
    echo 'exec "$@"' >> /usr/local/bin/entrypoint.sh && \
    chmod +x /usr/local/bin/entrypoint.sh

# Switch to non-root user
USER nodejs

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
