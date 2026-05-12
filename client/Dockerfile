# ================================
# Stage 1: Build React/Vite App
# ================================
FROM node:20-alpine AS build-stage

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source code
COPY . .


# Build production app
RUN npm run build

# ================================
# Stage 2: Serve with Nginx
# ================================
FROM nginxinc/nginx-unprivileged:stable-alpine

# Copy built Vite files
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose nginx port
EXPOSE 5173

# Start nginx
CMD ["nginx", "-g", "daemon off;"]