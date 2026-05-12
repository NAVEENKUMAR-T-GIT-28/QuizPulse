# Use Node 20 slim as base
FROM node:20-slim

# Install Chromium dependencies only if needed
ARG ENABLE_PUPPETEER=false

RUN if [ "$ENABLE_PUPPETEER" = "true" ]; then \
    apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    wget \
    xdg-utils \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*; \
fi

# Set working directory
WORKDIR /app

# Copy package files and fix ownership
COPY --chown=node:node package*.json ./

# Skip Puppeteer browser download during npm install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install production dependencies
RUN npm install --omit=dev

# Copy the rest of the application
COPY --chown=node:node . .

# Create directory for PDF generation if needed
RUN mkdir -p public/exports && chown -R node:node public/exports

# Switch to non-root user
USER node

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
