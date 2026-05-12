# 🐳 Frontend Docker Setup (QuizPulse Client)

This directory contains the Docker configuration for the React / Vite frontend.

## Dockerfile Overview
The `Dockerfile` is a **multi-stage build** designed for production efficiency.

- **Stage 1 (Build)**: Uses `node:20-alpine` to install dependencies and run `npm run build`. This stage reads the `client/.env` file to inject the `VITE_SERVER_URL` into the compiled JavaScript.
- **Stage 2 (Serve)**: Uses `nginxinc/nginx-unprivileged:stable-alpine`.
    - **Security**: Runs as a non-root user and listens on port `5173`.
    - **Configuration**: Uses a custom `nginx.conf` to support Single Page Application (SPA) routing and proxying.

## Environment Variables
The build stage expects a `.env` file in the `client/` directory with:
- `VITE_SERVER_URL=http://localhost:5000`

## Build & Run
Managed primarily by the root `docker-compose.yml`. To build individually:
```bash
docker build -t quizpulse-client .
```
