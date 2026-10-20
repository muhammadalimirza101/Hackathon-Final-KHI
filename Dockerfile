# Stage 1: build the React frontend
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI backend serving the API (/api) and the built frontend (/)
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY data/ /app/data/
COPY --from=frontend /app/frontend/dist /app/frontend/dist
ENV DATA_DIR=/app/data FRONTEND_DIST=/app/frontend/dist
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
