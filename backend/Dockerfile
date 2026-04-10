FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies into .venv
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

# Data dir for SQLite volume mount
RUN mkdir -p /data

EXPOSE 8000

# Run uvicorn directly from the venv — avoids uv run re-resolving packages on each start
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
