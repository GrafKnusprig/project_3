#!/bin/bash

# ESP Tunes - Launch Script
echo "🎵 Starting ESP Tunes Desktop App..."
echo "====================================="
echo "Starting Electron app with integrated backend..."
echo ""

# Use the built-in electron:dev script that properly manages the backend
npm run electron:dev
