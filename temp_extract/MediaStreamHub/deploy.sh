#!/bin/bash

# Build the client
echo "Building client..."
npm run build

# Ensure public directory exists in dist
echo "Preparing static files..."
mkdir -p dist/public

# Copy static files to the correct location
echo "Copying built files to dist/public..."
cp -r dist/client/* dist/public/

# Start the production server
echo "Starting production server..."
NODE_ENV=production node dist/index.js