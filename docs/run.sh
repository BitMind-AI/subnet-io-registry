#!/bin/bash

# Regenerate OpenAPI documentation using Python
echo "Regenerating OpenAPI documentation..."
# Try python3 first, fall back to python if not available
if command -v python3 &>/dev/null; then
    python3 generate_openapi.py
else
    python generate_openapi.py
fi

# Check if container exists and remove it
if [ "$(docker ps -a -q -f name=subnet-io-registry-swagger)" ]; then
    echo "Removing existing container..."
    docker rm -f subnet-io-registry-swagger
fi

# Create and run the new container
echo "Starting Swagger UI container..."
docker run -d -p 8080:8080 \
           -v ${PWD}/openapi.json:/openapi.json \
           -e SWAGGER_JSON=/openapi.json \
           --name subnet-io-registry-swagger \
           docker.swagger.io/swaggerapi/swagger-ui

echo "Swagger UI is running at http://localhost:8080"
