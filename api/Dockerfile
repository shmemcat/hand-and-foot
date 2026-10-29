FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
COPY handandfoot_server ./handandfoot_server
RUN uv sync --locked --no-dev
ARG VERSION=development
ARG REVISION=unknown
ENV PATH="/app/.venv/bin:$PATH" HANDANDFOOT_SERVER_VERSION=$VERSION HANDANDFOOT_SOURCE_REVISION=$REVISION HANDANDFOOT_AUTO_CREATE_SCHEMA=0 HANDANDFOOT_REQUIRE_ACCOUNTS=1
RUN useradd --create-home game && mkdir -p /app/.local && chown -R game:game /app
USER game
EXPOSE 5104
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5104/ready', timeout=2)"
CMD ["gunicorn", "--bind", "0.0.0.0:5104", "--workers", "1", "--threads", "16", "--worker-class", "gthread", "handandfoot_server.wsgi:app"]
