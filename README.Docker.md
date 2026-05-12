# 🐳 Docker Setup for QuizPulse (Three-Tier Architecture)

## Docker Images
- **Client**: `docker pull naveen282006/quizpulse-client:latest`
- **Server**: `docker pull naveen282006/quizpulse-server:latest`


This setup deploys the **QuizPulse** application as a complete three-tier system in Docker:
1.  **MongoDB**: Dedicated database container.
2.  **Node.js/Express**: Backend API and WebSocket server.
3.  **React/Vite**: Frontend served via Nginx.

## Features
-   **Independent Volumes**: Data persists for MongoDB (`mongodb-data`), backend exports (`quizpulse-server`), and frontend build assets (`quizpulse-client`).
-   **Resource Management**: Limits are set for each container to ensure stability.
-   **Container Naming**: Unique names prevent conflicts.
-   **Network Isolation**: All containers share the `quizpulse-network` bridge.

## Build & Run

1.  Ensure you have [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) installed.
2.  Open a terminal in the root directory (where this file is located).
3.  Run:
    ```bash
    docker compose up --build
    ```

Your application will be available at [http://localhost:5173](http://localhost:5173).

## Configuration

### Optional Puppeteer Support
By default, Chromium dependencies are **not installed** to minimize image size (reducing it from ~2GB to ~600MB). If you need PDF exports or screenshot features:

1.  In `docker-compose.yml`, change `ENABLE_PUPPETEER` to `"true"`:
    ```yaml
    server:
      build:
        args:
          ENABLE_PUPPETEER: "true"
    ```
2.  Rebuild the image:
    ```bash
    docker compose up --build
    ```

### Deploying your application to the cloud

First, build your image, e.g.: `docker build -t myapp .`.
If your cloud uses a different CPU architecture than your development
machine (e.g., you are on a Mac M1 and your cloud provider is amd64),
you'll want to build the image for that platform, e.g.:
`docker build --platform=linux/amd64 -t myapp .`.

Then, push it to your registry, e.g. `docker push myregistry.com/myapp`.

Consult Docker's [getting started](https://docs.docker.com/go/get-started-sharing/)
docs for more detail on building and pushing.

### References
* [Docker's Node.js guide](https://docs.docker.com/language/nodejs/)