#!/bin/bash

# ESP Tunes - Build Script for macOS
# Audio Converter & Flash Tool for ESP32 music player

set -e  # Exit on any error

echo "🎵 ESP Tunes - Build Script for macOS"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is designed for macOS only!"
    exit 1
fi

print_status "Checking system requirements..."

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    print_warning "Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ $(uname -m) == "arm64" ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    print_success "Homebrew is already installed"
fi

# Update Homebrew
print_status "Updating Homebrew..."
brew update

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_warning "Node.js not found. Installing Node.js..."
    brew install node
else
    NODE_VERSION=$(node --version)
    print_success "Node.js is already installed (${NODE_VERSION})"
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please reinstall Node.js"
    exit 1
fi

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    print_warning "FFmpeg not found. Installing FFmpeg..."
    brew install ffmpeg
else
    FFMPEG_VERSION=$(ffmpeg -version | head -n1 | cut -d' ' -f3)
    print_success "FFmpeg is already installed (${FFMPEG_VERSION})"
fi

# Install project dependencies
print_status "Installing project dependencies..."
if [ -f "package.json" ]; then
    npm install
    print_success "Dependencies installed successfully"
else
    print_error "package.json not found. Make sure you're in the project directory."
    exit 1
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p logs
mkdir -p temp

# Set executable permissions for the script
chmod +x build.sh

# Check if all required dependencies are available
print_status "Verifying installation..."

# Check Node.js modules
if [ ! -d "node_modules" ]; then
    print_error "Node modules not installed properly"
    exit 1
fi

# Verify FFmpeg installation with codec support
print_status "Verifying FFmpeg codec support..."
if ffmpeg -codecs 2>/dev/null | grep -q "mp3"; then
    print_success "MP3 codec support verified"
else
    print_warning "MP3 codec support not found"
fi

if ffmpeg -codecs 2>/dev/null | grep -q "flac"; then
    print_success "FLAC codec support verified"
else
    print_warning "FLAC codec support not found"
fi

# Create launch script
print_status "Creating launch script..."
cat > run.sh << 'EOF'
#!/bin/bash

# ESP Tunes - Launch Script
echo "🎵 Starting ESP Tunes..."
echo "========================"

# Start the application
npm run dev:full
EOF

chmod +x run.sh

# Create production build script
print_status "Creating production build script..."
cat > build-production.sh << 'EOF'
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
EOF

chmod +x build-production.sh

print_success "Build script completed successfully!"
echo ""
echo "🎵 ESP Tunes is ready to use!"
echo "=============================="
echo ""
echo "Available commands:"
echo "  ./run.sh                 - Start the development server"
echo "  ./build-production.sh    - Build for production"
echo "  npm run dev:full         - Start both backend and frontend"
echo "  npm run dev              - Start frontend only"
echo "  npm run server           - Start backend only"
echo ""
echo "📁 Project structure:"
echo "  Frontend: React + TypeScript + Tailwind CSS"
echo "  Backend:  Node.js + Express + FFmpeg"
echo "  Audio:    Supports MP3, FLAC, WAV, M4A, OGG, AAC, WMA"
echo "  Output:   Custom PCM format for ESP32"
echo ""
echo "🚀 To start the application, run: ./run.sh"
echo ""
print_success "Happy coding! 🎶"