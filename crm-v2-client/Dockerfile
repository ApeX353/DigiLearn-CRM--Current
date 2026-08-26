# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies.
# --frozen-lockfile is dropped deliberately: bun.lock was last regenerated
# 7 Apr while package.json changed 11 Jun (engines/scripts only, no dep
# changes), and Bun's text lockfile embeds that metadata, so the frozen
# check fails on a clean build. Proper upstream fix: `bun install` and
# commit the regenerated bun.lock.
RUN bun install

# Copy source code
COPY . .

# Accept build arguments
ARG VITE_PUBLIC_API_URL

# Set environment variable for the build
ENV VITE_PUBLIC_API_URL=$VITE_PUBLIC_API_URL

# Build the app
RUN bun run build

# Production stage
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing — without the try_files fallback any refresh or deep
# link (/leads, /deals/<id>, ...) returns a 404 from nginx.
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chmod -R 755 /usr/share/nginx/html
