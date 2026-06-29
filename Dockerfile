FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY Vibe-Trading/frontend/package.json Vibe-Trading/frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY Vibe-Trading/frontend/ ./
RUN npm run build

FROM python:3.11-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY Vibe-Trading/agent/requirements.txt agent/requirements.txt
RUN pip install --no-cache-dir -r agent/requirements.txt

COPY Vibe-Trading/pyproject.toml Vibe-Trading/LICENSE Vibe-Trading/README.md ./
COPY Vibe-Trading/agent/ agent/

COPY --from=frontend-build /app/frontend/dist frontend/dist

RUN pip install --no-cache-dir .

RUN useradd --create-home --shell /usr/sbin/nologin vibe \
    && mkdir -p agent/runs agent/sessions agent/uploads agent/.swarm/runs \
    && chown -R vibe:vibe /app
USER vibe

EXPOSE 8899

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8899/health')" || exit 1

CMD ["vibe-trading", "serve", "--host", "0.0.0.0", "--port", "8899"]
