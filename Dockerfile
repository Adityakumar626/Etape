# Multi-stage Python build using Astral uv for ultra-fast dependency resolution
FROM python:3.13-slim AS builder

WORKDIR /app

# Install uv binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency specifications
COPY pyproject.toml uv.lock ./

# Install dependencies into virtual environment without installing root project yet
RUN uv sync --frozen --no-install-project

# Copy project code
COPY . .

# Install root project into virtual environment
RUN uv sync --frozen

# ================================
# Runtime Image
# ================================
FROM python:3.13-slim AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# Copy virtual environment and source code from builder
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
