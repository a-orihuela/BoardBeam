# infra/updater/Dockerfile
FROM python:3.12-alpine

# Install Docker CLI + Compose v2 plugin (no Python docker-compose)
RUN apk add --no-cache docker-cli docker-cli-compose bash curl \
 && pip install --no-cache-dir gunicorn==22.0.0 flask==3.0.3

WORKDIR /app
COPY app.py /app/app.py

ENV PORT=8080
EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "--timeout", "900", "app:app"]
