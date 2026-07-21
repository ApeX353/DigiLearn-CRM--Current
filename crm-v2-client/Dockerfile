# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

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

RUN chmod -R 777 /usr/share/nginx/html
