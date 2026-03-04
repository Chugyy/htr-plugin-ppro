FROM python:3.11-slim

WORKDIR /app

COPY config/requirements.txt config/requirements.txt
RUN pip install --no-cache-dir -r config/requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=5001
ENV DEBUG=false

EXPOSE 5001

# Build: docker build -t htr-backend:latest .
# Run:   docker run --rm -p 5001:5001 --env-file config/.env htr-backend:latest
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5001"]
