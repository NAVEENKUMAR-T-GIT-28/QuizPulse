# 🐳 Backend Docker Setup (QuizPulse Server)

This directory contains the Docker configuration for the Node.js / Express backend.

## Dockerfile Overview
The `Dockerfile` uses a multi-stage approach or a hardened single stage depending on the complexity.

- **Base Image**: `node:20-slim` (chosen for small footprint and security).
- **Security**: The container runs as the non-root `node` user.
- **Dependencies**: Includes optional system libraries for **Puppeteer** (Chromium) to support PDF generation. This is disabled by default to keep the image size small.
- **Volumes**: Maps `/app/public/exports` to a persistent volume (`quizpulse-server`) to ensure generated PDFs are not lost on container restart.

## Environment Variables
The container expects a `.env` file at the root of the `server/` directory.
Key variables for Docker:
- `MONGODB_URI=mongodb://mongodb:27017/QuizApp` (Connects to the sibling database container).
- `PORT=5000`

### Build Arguments
- `ENABLE_PUPPETEER`: Set to `true` to install Chromium dependencies (Default: `false`).

### Manual Build
```bash
docker build --build-arg ENABLE_PUPPETEER=true -t quizpulse-server .
```
