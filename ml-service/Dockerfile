# ml-service image. BUILD CONTEXT IS THE REPO ROOT (it needs data/external/airports.csv too):
#   docker build -f ml-service/Dockerfile -t fdp-ml .
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libgomp1: OpenMP runtime XGBoost needs. curl + ca-certificates: optional analytics-data download (entrypoint).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# layout mirrors the repo so the default relative paths (../data/external, ../data/processed) resolve unchanged
WORKDIR /srv/ml-service

COPY ml-service/requirements.txt .
RUN pip install -r requirements.txt

COPY ml-service/app ./app
# feature_builder imports training.encoders (the encoder is shared by training and serving)
COPY ml-service/training ./training
# trained models, calibrators, encoders, lookups, metrics, SHAP background (about 4 MB, committed to git)
COPY ml-service/artifacts ./artifacts
COPY data/external /srv/data/external
COPY ml-service/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && useradd --create-home --uid 10001 app \
    && mkdir -p /srv/data/processed \
    && chown -R app:app /srv
USER app

EXPOSE 8000
# /health needs the shared key like every other route, so the probe sends it
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import os,sys,urllib.request as u; r=u.Request('http://127.0.0.1:8000/health',headers={'X-Internal-Key':os.environ.get('INTERNAL_API_KEY','')}); sys.exit(0 if u.urlopen(r,timeout=4).status==200 else 1)"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
