#!/bin/bash

# Ensure Docker daemon is running
if ! docker info &>/dev/null; then
  echo "Docker daemon not running. Starting Docker Desktop..."
  open -a Docker
  echo "Waiting for Docker to start..."
  until docker info &>/dev/null; do sleep 2; done
  echo "Docker is ready."
fi

# Build Docker image
docker build -t corrector:latest .

# Remove existing container if present
docker rm -f corrector 2>/dev/null

# Run container
docker run --rm -p 8080:8080 --name corrector corrector:latest
