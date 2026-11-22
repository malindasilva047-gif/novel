FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY sql/ ./sql/
COPY uploads/ ./uploads/

# The backend requires MySQL. Local settings stay in backend/.env; production
# credentials are supplied by the hosting platform at runtime.
ENV DB_TYPE=mysql \
    MYSQL_SSL_DISABLED=false \
    UPLOAD_DIR=/app/uploads \
    PYTHONUNBUFFERED=1 \
    PORT=8000

RUN mkdir -p /app/uploads

# SnapDeploy can route to this port; PORT can still override it at runtime.
EXPOSE 8000

CMD ["sh", "-c", "mkdir -p \"${UPLOAD_DIR:-/app/uploads}\" && uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --proxy-headers --forwarded-allow-ips='*'"]
