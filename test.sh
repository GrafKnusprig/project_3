#!/bin/bash
set -e

# Run all tests (frontend and backend)
# Use ESM support for Node and Jest

# Run backend tests (ESM)
echo "Running backend tests..."
NODE_OPTIONS="--experimental-vm-modules" npx jest --config jest.config.cjs __tests__/backend.sync.test.js

# Run frontend tests (TS/React)
echo "Running frontend tests..."
NODE_OPTIONS="--experimental-vm-modules" npx jest --config jest.config.cjs __tests__/App.test.tsx

echo "All tests completed."
