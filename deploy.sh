#!/bin/bash

# Deploy Convex functions and build frontend
# Run this script after any code changes

set -e

echo "Installing dependencies..."
npm install

echo "Deploying Convex functions..."
npx convex deploy

echo "Building frontend..."
npm run build

echo "Deployment complete!"
echo ""
echo "If using Docker, restart the container:"
echo "  docker-compose down && docker-compose up -d --build"
