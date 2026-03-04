#!/bin/bash

# Build Docker image
docker build -t corrector:latest .

# Remove existing container if present
docker rm -f corrector 2>/dev/null

# Run container
docker run --rm -p 8080:8080 --name corrector corrector:latest
