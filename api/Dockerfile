FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
COPY handandfoot_server ./handandfoot_server
RUN pip install --no-cache-dir .
RUN useradd --create-home game && mkdir -p /app/.local && chown -R game:game /app
USER game
EXPOSE 5104
CMD ["gunicorn", "--bind", "0.0.0.0:5104", "--workers", "1", "--threads", "16", "--worker-class", "gthread", "handandfoot_server.wsgi:app"]
