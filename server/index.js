import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import { getDiskInfo } from 'node-disk-info';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Custom PCM header structure
const createPCMHeader = (sampleRate, bitDepth, channels, dataSize) => {
  const header = Buffer.alloc(32); // 32-byte header
  let offset = 0;
  
  // Magic number "ESP32PCM" (8 bytes)
  header.write('ESP32PCM', offset);
  offset += 8;
  
  // Sample rate (4 bytes, little-endian)
  header.writeUInt32LE(sampleRate, offset);
  offset += 4;
  
  // Bit depth (2 bytes, little-endian)
  header.writeUInt16LE(bitDepth, offset);
  offset += 2;
  
  // Channels (2 bytes, little-endian)
  header.writeUInt16LE(channels, offset);
  offset += 2;
  
  // Data size (4 bytes, little-endian)
  header.writeUInt32LE(dataSize, offset);
  offset += 4;
  
  // Reserved/padding (12 bytes)
  header.fill(0, offset);
  
  return header;
};

// Get file system structure
app.get('/api/filesystem', async (req, res) => {
  try {
    const rootPath = req.query.path || (process.platform === 'win32' ? 'C:\\' : '/');
    const items = await scanDirectory(rootPath);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function scanDirectory(dirPath, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  
  try {
    const items = await fs.readdir(dirPath);
    const result = [];
    
    for (const item of items.slice(0, 50)) { // Limit items for performance
      try {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          const children = await scanDirectory(fullPath, maxDepth, currentDepth + 1);
          result.push({
            id: fullPath,
            name: item,
            type: 'folder',
            path: fullPath,
            children: children
          });
        } else if (isAudioFile(item)) {
          result.push({
            id: fullPath,
            name: item,
            type: 'file',
            path: fullPath,
            isAudio: true
          });
        }
      } catch (err) {
        // Skip files we can't access
        continue;
      }
    }
    
    return result;
  } catch (error) {
    return [];
  }
}

function isAudioFile(filename) {
  const audioExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.wma'];
  const ext = path.extname(filename).toLowerCase();
  return audioExtensions.includes(ext);
}

// Get connected storage devices
app.get('/api/devices', async (req, res) => {
  try {
    const disks = await getDiskInfo();
    const devices = disks
      .filter(disk => disk.mounted && disk.filesystem !== 'tmpfs')
      .map(disk => ({
        id: disk.mounted,
        name: `${disk.filesystem} (${disk.mounted})`,
        type: disk.mounted.includes('sd') ? 'sd' : 'usb',
        capacity: formatBytes(disk.blocks * 1024),
        freeSpace: formatBytes(disk.available * 1024),
        isConnected: true,
        mountPath: disk.mounted
      }));
    
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Convert and flash audio files
app.post('/api/convert-and-flash', async (req, res) => {
  const { files, devicePath, libraryStructure } = req.body;
  
  try {
    // Create output directory on device
    const outputDir = path.join(devicePath, 'ESP32_MUSIC');
    await fs.mkdir(outputDir, { recursive: true });
    
    const convertedFiles = [];
    let totalFiles = files.length;
    let processedFiles = 0;
    
    // Send initial response
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked'
    });
    
    for (const file of files) {
      try {
        const outputFilename = path.basename(file.path, path.extname(file.path)) + '.pcm';
        const outputPath = path.join(outputDir, outputFilename);
        
        // Send progress update
        res.write(JSON.stringify({
          type: 'progress',
          file: file.name,
          progress: Math.round((processedFiles / totalFiles) * 100)
        }) + '\n');
        
        await convertToPCM(file.path, outputPath);
        
        convertedFiles.push({
          original: file.path,
          converted: outputPath,
          name: file.name
        });
        
        processedFiles++;
      } catch (error) {
        console.error(`Error converting ${file.path}:`, error);
        res.write(JSON.stringify({
          type: 'error',
          file: file.name,
          error: error.message
        }) + '\n');
      }
    }
    
    // Create index file
    const indexData = {
      version: '1.0',
      totalFiles: convertedFiles.length,
      structure: libraryStructure,
      files: convertedFiles.map(f => ({
        name: f.name,
        pcmFile: path.basename(f.converted),
        originalPath: f.original
      }))
    };
    
    await fs.writeFile(
      path.join(outputDir, 'index.json'),
      JSON.stringify(indexData, null, 2)
    );
    
    res.write(JSON.stringify({
      type: 'complete',
      message: `Successfully converted ${convertedFiles.length} files`,
      outputDir
    }) + '\n');
    
    res.end();
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function convertToPCM(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // First, get audio info
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      if (!audioStream) return reject(new Error('No audio stream found'));
      
      const sampleRate = audioStream.sample_rate || 44100;
      const channels = audioStream.channels || 2;
      const bitDepth = 16; // We'll standardize to 16-bit
      
      // Convert to raw PCM
      const tempPcmPath = outputPath + '.temp';
      
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(sampleRate)
        .audioChannels(channels)
        .format('s16le')
        .output(tempPcmPath)
        .on('end', async () => {
          try {
            // Read the raw PCM data
            const pcmData = await fs.readFile(tempPcmPath);
            
            // Create custom header
            const header = createPCMHeader(sampleRate, bitDepth, channels, pcmData.length);
            
            // Combine header and PCM data
            const finalData = Buffer.concat([header, pcmData]);
            
            // Write final file
            await fs.writeFile(outputPath, finalData);
            
            // Clean up temp file
            await fs.unlink(tempPcmPath);
            
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject)
        .run();
    });
  });
}

app.listen(PORT, () => {
  console.log(`ESP32 Music Manager server running on http://localhost:${PORT}`);
});