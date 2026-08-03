FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data/rag/chroma ./data/rag/chroma
COPY data/rag/sources.json ./data/rag/sources.json

ENV RAG_DB_PATH=/app/data/rag/chroma
ENV GMS_MODEL=gpt-5-mini

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
