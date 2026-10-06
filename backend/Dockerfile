FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=3000

WORKDIR /app

# asyncpg/cryptography ship prebuilt wheels; no build toolchain needed.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app
COPY db ./db
COPY scripts ./scripts

# Run as an unprivileged user (defense in depth).
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

# $PORT lets the host (Render / ECS / Fly / Railway) pick the port.
# Single worker by default — the durable sync worker can run in-process
# (SYNC_WORKER_ENABLED=true) on a single instance, or as a separate
# `python -m scripts.worker` service when you scale out.
# ALLOWED_HOSTS falls back to Render's own hostname (ENV=production rejects '*').
CMD ["sh", "-c", "export ALLOWED_HOSTS=\"${ALLOWED_HOSTS:-${RENDER_EXTERNAL_HOSTNAME:-*}}\"; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000}"]
