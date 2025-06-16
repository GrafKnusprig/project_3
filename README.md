# ESP32 Music Manager

A modern web application for managing and converting music files for ESP32-based devices. The ground structure of this project was created using the [bolt.new](https://bolt.new) AI tool.

## Overview

ESP32 Music Manager is a full-stack application that allows you to:

- Manage music libraries on your computer
- Connect to ESP32 devices via USB or SD card
- Convert audio files to ESP32-compatible PCM format
- Transfer converted music files to connected devices
- Monitor conversion progress

This tool is designed for hobbyists and developers working with ESP32-based audio projects, allowing easy management of audio content on these devices.

## Features

- **Device Detection**: Automatically detects only removable storage devices (USB drives and SD cards) across Windows, macOS, and Linux
- **Music Library Management**: Organize and manage your audio files
- **File Explorer**: Browse your computer's file system to add audio content
- **Audio Conversion**: Convert various audio formats to ESP32-compatible PCM format with custom header
- **Conversion Progress Monitoring**: Real-time progress tracking for conversions
- **Modern UI**: Clean interface built with React and TailwindCSS

## Tech Stack

### Frontend
- React 18
- TypeScript
- TailwindCSS
- Vite
- Lucide icons

### Backend
- Node.js
- Express
- fluent-ffmpeg for audio conversion
- node-disk-info for device management

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- ffmpeg installed on your system

### Installation

1. Clone this repository
```bash
git clone https://github.com/yourusername/esp32-music-manager.git
cd esp32-music-manager
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm run dev:full
```

This will start both the backend server and the frontend development server concurrently.

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## How It Works

1. Connect your ESP32 device or SD card to your computer
2. Launch the ESP32 Music Manager
3. Select files from your music library or browse for new files
4. Select your target device
5. Start the conversion process
6. The application will convert your audio files to ESP32-compatible PCM format
7. The converted files will be transferred to the selected device

## License

[MIT License](LICENSE)

## Acknowledgments

- Project structure initially created with [bolt.new](https://bolt.new) AI tool
- Icons by [Lucide](https://lucide.dev/)
