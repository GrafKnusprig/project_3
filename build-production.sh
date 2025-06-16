#!/bin/bash

# ESP Tunes - Production Build Script
echo "🎵 Building ESP Tunes for production..."
echo "======================================"

# Build the frontend
echo "Building frontend..."
npm run build

# Create production server script
cat > server-production.js << 'PROD_EOF'
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Import and use the API routes from server/index.js
import('./server/index.js');

// Serve the React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ESP Tunes production server running on http://localhost:${PORT}`);
});
PROD_EOF

echo "✅ Production build complete!"
echo "Run 'node server-production.js' to start the production server"
