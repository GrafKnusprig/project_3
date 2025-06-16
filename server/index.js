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
    let rootPath = req.query.path;
    
    // If no path specified, use appropriate home directory based on platform
    if (!rootPath) {
      // Default to user's home directory
      const homePath = process.platform === 'win32'
        ? process.env.USERPROFILE
        : process.env.HOME;
      
      // On macOS, directly provide common music locations instead of scanning the whole home
      if (process.platform === 'darwin') {
        return res.json([
          {
            id: path.join(homePath, 'Music'),
            name: 'Music',
            type: 'folder',
            path: path.join(homePath, 'Music'),
            hasChildren: true
          },
          {
            id: path.join(homePath, 'Downloads'),
            name: 'Downloads',
            type: 'folder',
            path: path.join(homePath, 'Downloads'),
            hasChildren: true
          },
          {
            id: path.join(homePath, 'Documents'),
            name: 'Documents',
            type: 'folder',
            path: path.join(homePath, 'Documents'),
            hasChildren: true
          },
          {
            id: path.join(homePath, 'Desktop'),
            name: 'Desktop',
            type: 'folder',
            path: path.join(homePath, 'Desktop'),
            hasChildren: true
          },
          {
            id: homePath,
            name: 'Home Directory',
            type: 'folder',
            path: homePath,
            hasChildren: true
          },
          {
            id: '/',
            name: 'Root',
            type: 'folder',
            path: '/',
            hasChildren: true
          }
        ]);
      }
      
      rootPath = homePath;
    }

    // Get information about requested path to check access
    try {
      await fs.access(rootPath, fs.constants.R_OK);
    } catch (accessError) {
      // If access fails, fallback to home directory
      rootPath = process.platform === 'win32' 
        ? process.env.USERPROFILE 
        : process.env.HOME;
    }
    
    // Special handling for Library folder on macOS - avoid scanning it
    if (process.platform === 'darwin' && 
        (rootPath.includes('/Library/') || rootPath.endsWith('/Library'))) {
      return res.json([{
        id: path.dirname(rootPath),
        name: 'Back',
        type: 'folder',
        path: path.dirname(rootPath),
        isParent: true
      }]);
    }
    
    const items = await scanDirectory(rootPath);
    
    // Add special entry for home directory if we're not already there
    const homePath = process.platform === 'win32' 
      ? process.env.USERPROFILE 
      : process.env.HOME;
      
    if (rootPath !== homePath && !items.find(item => item.path === homePath)) {
      items.unshift({
        id: homePath,
        name: 'Home Directory',
        type: 'folder',
        path: homePath,
        special: true
      });
    }
    
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List of system directories to skip for better performance and fewer permission errors
const systemDirsToSkip = [
  'Library', '.Trash', 'System', 'Private', 'Applications', 'usr', 'bin', 'etc', 'var',
  'tmp', 'opt', 'boot', 'dev', 'proc', 'sys', 'Windows', 'Program Files', 'Program Files (x86)', 
  'ProgramData', '$Recycle.Bin', 'AppData', 'System Volume Information'
];

// List of user directories to prioritize
const userDirectoriesToPrioritize = ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Videos'];

async function scanDirectory(dirPath, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  
  try {
    // Skip scanning system directories that commonly have permission issues
    const dirName = path.basename(dirPath);
    if (currentDepth > 0 && systemDirsToSkip.includes(dirName)) {
      return [{
        id: dirPath,
        name: dirName,
        type: 'folder',
        path: dirPath,
        systemDir: true,
        hasChildren: true
      }];
    }
    
    // Check if we have read permissions without logging warnings
    try {
      await fs.access(dirPath, fs.constants.R_OK);
    } catch (accessError) {
      // Silently return a permission denied entry without logging
      return [{ 
        id: dirPath,
        name: path.basename(dirPath),
        type: 'folder',
        path: dirPath,
        error: 'Permission denied',
        accessDenied: true
      }];
    }
    
    const items = await fs.readdir(dirPath);
    const result = [];
    
    // Add parent directory navigation if we're not at root
    if (dirPath !== '/' && !(/^[A-Z]:\\$/i.test(dirPath))) {
      const parentPath = path.dirname(dirPath);
      result.push({
        id: parentPath,
        name: '..',
        type: 'folder',
        path: parentPath,
        isParent: true
      });
    }
    
    // Filter out hidden files (starting with .) first
    const visibleItems = items.filter(item => 
      (item === '..') || !(item.startsWith('.') || item === 'Library')
    );
    
    // Sort items to prioritize directories and common user directories
    const sortedItems = [...visibleItems].sort((a, b) => {
      const aIsCommon = userDirectoriesToPrioritize.includes(a);
      const bIsCommon = userDirectoriesToPrioritize.includes(b);
      
      if (aIsCommon && !bIsCommon) return -1;
      if (!aIsCommon && bIsCommon) return 1;
      return a.localeCompare(b);
    });
    
    // Process directories first, then files (limited to 100 total for performance)
    for (const item of sortedItems.slice(0, 100)) {
      try {
        const fullPath = path.join(dirPath, item);
        
        // Skip known system directories that often have permission issues
        if (systemDirsToSkip.includes(item)) {
          continue;
        }
        
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          // For better performance, don't recursively scan directories at the beginning
          result.push({
            id: fullPath,
            name: item,
            type: 'folder',
            path: fullPath,
            hasChildren: true
          });
        } else if (isAudioFile(item)) {
          result.push({
            id: fullPath,
            name: item,
            type: 'file',
            path: fullPath,
            isAudio: true,
            size: formatBytes(stats.size)
          });
        }
      } catch (err) {
        // Silently skip files/directories we can't access without logging
        continue;
      }
    }
    
    return result;
  } catch (error) {
    // Only log errors for directories that aren't obviously going to fail
    if (!systemDirsToSkip.includes(path.basename(dirPath))) {
      console.error(`Error scanning directory ${dirPath}: ${error.message}`);
    }
    
    return [{
      id: dirPath,
      name: path.basename(dirPath),
      type: 'folder',
      path: dirPath,
      error: error.message
    }];
  }
}

function isAudioFile(filename) {
  const audioExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.wma'];
  const ext = path.extname(filename).toLowerCase();
  return audioExtensions.includes(ext);
}

// Helper function to detect removable drives
function isRemovableDrive(disk) {
  // Common patterns for removable drives across platforms
  const removablePatterns = {
    windows: /^[D-Z]:\\$/i, // Typically drives D: and onwards, except C: (system)
    mac: /^\/Volumes\/(?!Macintosh HD|System|home)/i, // Volumes except system volumes
    linux: /^\/media\/|^\/mnt\/|^\/run\/media\//i, // Common mount points for removable media
  };

  // Skip system and temporary filesystems
  if (disk.filesystem === 'tmpfs' || 
      disk.filesystem === 'devfs' || 
      disk.filesystem === 'sysfs' || 
      disk.filesystem === 'proc') {
    return false;
  }

  // OS-specific detection
  if (process.platform === 'win32') {
    // For Windows: Check drive letter pattern and exclude C:
    return removablePatterns.windows.test(disk.mounted) && 
           !disk.mounted.toLowerCase().startsWith('c:');
  } else if (process.platform === 'darwin') {
    // For macOS: Check Volumes pattern and exclude system volumes
    return removablePatterns.mac.test(disk.mounted);
  } else {
    // For Linux: Check common mount points for removable media
    return removablePatterns.linux.test(disk.mounted);
  }
}

// Get connected storage devices
app.get('/api/devices', async (req, res) => {
  try {
    const disks = await getDiskInfo();
    const devices = disks
      .filter(disk => disk.mounted && isRemovableDrive(disk))
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