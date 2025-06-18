import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { getDiskInfo } from 'node-disk-info';

// Set FFmpeg path to use the static binary
if (ffmpegPath) {
  console.log(`Using FFmpeg from: ${ffmpegPath}`);
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  console.warn('ffmpeg-static package found no valid FFmpeg binary, will fallback to system FFmpeg if available');
}

// Keep track of temporary files for cleanup
const tempFiles = new Set();

// Function to register a temp file for later cleanup
const registerTempFile = (filePath) => {
  tempFiles.add(filePath);
  console.log(`Registered temporary file for cleanup: ${filePath}`);
};

// Function to clean up all registered temp files
const cleanupTempFiles = async () => {
  console.log(`Cleaning up ${tempFiles.size} temporary files`);
  const cleanupPromises = [];

  for (const tempFile of tempFiles) {
    cleanupPromises.push(
      fs.unlink(tempFile)
        .then(() => {
          console.log(`Deleted temporary file: ${tempFile}`);
          tempFiles.delete(tempFile);
        })
        .catch(err => {
          console.warn(`Warning: Could not delete temp file: ${tempFile}`, err);
        })
    );
  }

  await Promise.allSettled(cleanupPromises);
  console.log(`Temp file cleanup complete. ${tempFiles.size} files remaining.`);
};

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

    // Add special Home Directory navigation item (marked special: true)
    if (rootPath !== homePath && !items.find(item => item.path === homePath)) {
      items.unshift({
        id: homePath,
        name: 'Home Directory',
        type: 'folder',
        path: homePath,
        special: true // This flag helps identify it as a special navigation item, not regular content
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

  console.log(`Received convert-and-flash request:`);
  console.log(`- Device path: ${devicePath}`);
  console.log(`- Files to convert: ${files.length}`);
  console.log(`- Library structure contains ${libraryStructure.musicFolders.length} folders`);

  try {
    // First, check if the device is actually a mounted file system
    let isDirectoryAccessible = false;
    try {
      const stats = await fs.stat(devicePath);
      if (stats.isDirectory()) {
        isDirectoryAccessible = true;
        console.log(`Device path is a valid directory: ${devicePath}`);
      } else {
        console.error(`Device path exists but is not a directory: ${devicePath}`);
        throw new Error(`Device path is not a directory: ${devicePath}`);
      }
    } catch (err) {
      console.error(`Unable to access device path: ${devicePath}`, err);
      throw new Error(`Device path not accessible: ${devicePath}. Make sure the SD card is properly inserted.`);
    }

    // Verify the device path is writable
    try {
      // Create a test file to confirm we can write to the device
      const testFilePath = path.join(devicePath, '.write_test');
      await fs.writeFile(testFilePath, 'test');
      await fs.unlink(testFilePath);
      console.log(`Device path is writable: ${devicePath}`);
    } catch (err) {
      console.error(`Device path not writable: ${devicePath}`, err);
      throw new Error(`Device path not writable: ${devicePath}. Check if the SD card is write-protected.`);
    }

    // Do an explicit write test to verify SD card is truly writeable
    const isWritable = await testDirectoryWritable(devicePath);
    if (!isWritable) {
      throw new Error(`Device appears to be read-only or has permission issues. Please check if the SD card is write-protected.`);
    }
    console.log(`Write test successful - SD card is confirmed writable`);

    // Create output directory on device
    const outputDir = path.join(devicePath, 'ESP32_MUSIC');
    console.log(`Creating output directory: ${outputDir}`);
    try {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`Output directory created: ${outputDir}`);

      // Verify the output directory is also writable
      const isOutputDirWritable = await testDirectoryWritable(outputDir);
      if (!isOutputDirWritable) {
        throw new Error(`Output directory is not writable. Please check SD card permissions or if it's write-protected.`);
      }
      console.log(`Output directory is writable: ${outputDir}`);
    } catch (err) {
      console.error(`Failed to create or verify output directory: ${outputDir}`, err);
      throw new Error(`Failed to create output directory on the SD card. Check if the card is full or write-protected.`);
    }

    const convertedFiles = [];
    let totalFiles = files.length;
    let processedFiles = 0;

    // Send initial response
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked'
    });

    // Create folder structure based on virtual folders
    const musicFolders = libraryStructure.musicFolders || [];
    console.log(`Creating folder structure for ${musicFolders.length} music folders`);

    // Create folders for all music folders
    for (const folder of musicFolders) {
      const folderPath = path.join(outputDir, folder.name);
      console.log(`Creating folder: ${folderPath}`);
      await fs.mkdir(folderPath, { recursive: true });
      console.log(`Created folder: ${folderPath} with ${folder.files.length} audio files`);
    }

    // Send preparation complete status
    res.write(JSON.stringify({
      type: 'status',
      step: 'preparation',
      status: 'completed',
      message: 'Folder structure created successfully'
    }) + '\n');

    // Track already exported files to avoid duplicates
    const exportedFiles = new Set();

    // Process all audio files
    console.log(`Starting to process ${files.length} audio files`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name} (${file.path})`);

      try {
        if (exportedFiles.has(file.path)) {
          console.log(`Skipping already exported file: ${file.path}`);
          processedFiles++;
          continue; // Skip already exported files
        }

        // Debug information about the file
        console.log(`File details:`, {
          name: file.name,
          path: file.path,
          type: file.type,
          isAudio: file.isAudio,
          parent: file.parent
        });

        // Find the file's folder in libraryStructure
        let targetFolder = null;
        let relativePath = '';

        // Find which folder contains this file
        console.log(`Looking for folder containing file: ${file.name}`);
        for (const folder of musicFolders) {
          const foundFile = folder.files.find(f => f.name === file.name);
          if (foundFile) {
            targetFolder = folder.name;
            console.log(`Found file in folder: ${folder.name}`);
            break;
          }
        }

        if (!targetFolder) {
          console.log(`File ${file.name} not found in any specific folder, will be placed in root`);
        }

        // Determine where to put the file (in folder or root)
        let folderPath;
        if (targetFolder) {
          folderPath = path.join(outputDir, targetFolder);
          // Use forward slashes for all paths in the index file (for ESP32 compatibility)
          relativePath = `${targetFolder}/${path.basename(file.path, path.extname(file.path))}.pcm`.replace(/\\/g, '/');
          console.log(`Will place file in folder: ${folderPath}`);
        } else {
          folderPath = outputDir;
          relativePath = `${path.basename(file.path, path.extname(file.path))}.pcm`;
          console.log(`Will place file in root folder: ${folderPath}`);
        }

        // Make sure the folder exists
        console.log(`Ensuring folder exists: ${folderPath}`);
        await fs.mkdir(folderPath, { recursive: true });

        const outputFilename = path.basename(file.path, path.extname(file.path)) + '.pcm';
        const outputPath = path.join(folderPath, outputFilename);
        console.log(`Output path for converted file: ${outputPath}`);

        // Send progress update - now specific to conversion step
        const progressMessage = {
          type: 'progress',
          step: 'conversion',
          file: file.name,
          progress: Math.round((processedFiles / totalFiles) * 100),
          folder: targetFolder || 'root',
          current: processedFiles + 1,
          total: totalFiles
        };
        console.log(`Sending progress update:`, progressMessage);
        res.write(JSON.stringify(progressMessage) + '\n');

        // Verify the source file exists and is accessible
        try {
          await fs.access(file.path, fs.constants.R_OK);
          console.log(`Source file verified: ${file.path}`);
        } catch (err) {
          console.error(`Source file not accessible: ${file.path}`, err);
          throw new Error(`Source file not accessible: ${file.path}`);
        }

        console.log(`Starting PCM conversion for: ${file.path}`);
        await convertToPCM(file.path, outputPath);
        console.log(`PCM conversion completed: ${outputPath}`);

        // Verify the output file was created
        try {
          await fs.access(outputPath, fs.constants.R_OK);
          console.log(`Verified output file exists: ${outputPath}`);
        } catch (err) {
          console.error(`Output file does not exist: ${outputPath}`, err);
          throw new Error(`Failed to create output file: ${outputPath}`);
        }

        convertedFiles.push({
          original: file.path,
          converted: outputPath,
          name: file.name,
          relativePath: relativePath
        });

        exportedFiles.add(file.path);
        processedFiles++;
        console.log(`Successfully processed file ${i + 1}/${files.length}`);
      } catch (error) {
        console.error(`Error converting ${file.path}:`, error);
        res.write(JSON.stringify({
          type: 'error',
          file: file.name,
          error: error.message
        }) + '\n');
      }
    }

    console.log(`Finished processing all files. Successfully converted: ${convertedFiles.length}/${files.length}`);


    // Create index file with the proper format for ESP32
    // Print raw data for debugging
    console.log(`Converted files (${convertedFiles.length}):`);
    convertedFiles.forEach(f => {
      console.log(` - ${f.name} => ${f.relativePath}`);
    });

    // Normalize all paths in the index file to use forward slashes only (ESP32 compatibility)
    const normalizedFiles = convertedFiles.map(f => ({
      ...f,
      relativePath: f.relativePath.replace(/\\/g, '/')
    }));

    const indexData = {
      version: '1.0',
      totalFiles: normalizedFiles.length,
      allFiles: normalizedFiles.map(f => ({
        name: f.name,
        path: f.relativePath // Use relative path with consistent forward slashes
      })),
      musicFolders: musicFolders.map(folder => {
        console.log(`Processing folder for index: ${folder.name}`);
        const folderFiles = folder.files.map(file => {
          // Find the corresponding converted file
          const convertedFile = normalizedFiles.find(f => f.name === file.name);
          if (convertedFile) {
            console.log(` - Found converted file: ${file.name} => ${convertedFile.relativePath}`);
          } else {
            console.log(` - No converted file found for: ${file.name}`);
          }
          return {
            name: file.name,
            path: convertedFile ? convertedFile.relativePath : '' // Use normalized path
          };
        }).filter(f => f.path); // Remove any files that weren't converted

        console.log(`Folder ${folder.name} has ${folderFiles.length} converted files`);
        return {
          name: folder.name,
          files: folderFiles
        };
      })
    };

    const indexFilePath = path.join(outputDir, 'index.json');
    console.log(`Writing index file to: ${indexFilePath}`);

    // First write to a temp file to avoid SD card issues
    const tempIndexFilePath = path.join(os.tmpdir(), `esp32_index_${Date.now()}.json`);
    // Register this temp file for later cleanup
    registerTempFile(tempIndexFilePath);
    const indexContent = JSON.stringify(indexData, null, 2);

    console.log(`Index file content preview (first 200 chars):`);
    console.log(indexContent.substring(0, 200) + '...');

    try {
      // First write to temp location
      await fs.writeFile(tempIndexFilePath, indexContent);
      console.log(`Index file written to temp location: ${tempIndexFilePath}`);

      // Verify the temp index file was written correctly
      try {
        const verificationData = await fs.readFile(tempIndexFilePath, 'utf8');
        const parsedData = JSON.parse(verificationData);
        console.log(`Temp index file verified with ${parsedData.totalFiles} files and ${parsedData.musicFolders.length} folders`);

        // If verification passes, copy to SD card
        await fs.copyFile(tempIndexFilePath, indexFilePath);
        console.log(`Index file copied to SD card: ${indexFilePath}`);

        // Final verification on SD card
        try {
          const finalVerificationData = await fs.readFile(indexFilePath, 'utf8');
          const finalParsedData = JSON.parse(finalVerificationData);
          console.log(`Final index file verified with ${finalParsedData.totalFiles} files and ${finalParsedData.musicFolders.length} folders`);

          // Send index file creation status
          res.write(JSON.stringify({
            type: 'status',
            step: 'index',
            status: 'completed',
            message: `Index file created with ${finalParsedData.totalFiles} files and ${finalParsedData.musicFolders.length} folders`
          }) + '\n');

          // Send files copied status
          res.write(JSON.stringify({
            type: 'status',
            step: 'copy',
            status: 'completed',
            message: `All files successfully copied to SD card`
          }) + '\n');

        } catch (finalVerifyErr) {
          console.error(`Failed to verify final index file on SD card: ${indexFilePath}`, finalVerifyErr);
        }

        // Will clean up temp files at the end of the conversion process

      } catch (verifyErr) {
        console.error(`Failed to verify index file: ${tempIndexFilePath}`, verifyErr);
        throw verifyErr;
      }

    } catch (writeErr) {
      console.error(`Failed to write index file: ${writeErr.code ? `Error code: ${writeErr.code}` : ''}`, writeErr);
      throw new Error(`Failed to write index file to SD card: ${writeErr.message}. Check if the card is full or write-protected.`);
    }

    // Clean up all temporary files from the system temp directory
    console.log(`Starting final cleanup of all temporary files...`);
    await cleanupTempFiles();

    // Send cleanup status
    res.write(JSON.stringify({
      type: 'status',
      step: 'cleanup',
      status: 'completed',
      message: `Temporary files cleaned up successfully`
    }) + '\n');

    res.write(JSON.stringify({
      type: 'complete',
      message: `Successfully converted ${convertedFiles.length} files`,
      outputDir,
      tempFilesCleanedUp: true,
      stats: {
        filesConverted: convertedFiles.length,
        totalFiles: files.length,
        foldersCreated: musicFolders.length
      }
    }) + '\n');

    res.end();

  } catch (error) {
    // Clean up temp files even if there was an error
    console.log(`Error occurred, cleaning up temporary files...`);
    await cleanupTempFiles();

    res.status(500).json({ error: error.message });
  }
});

// Convert audio to PCM with custom ESP32 headers
async function convertToPCM(inputPath, outputPath) {
  console.log(`Converting ${inputPath} to ${outputPath}`);

  // Check if source file exists before starting conversion
  try {
    await fs.access(inputPath, fs.constants.R_OK);
    console.log(`Source file exists and is readable: ${inputPath}`);
  } catch (err) {
    console.error(`Source file not accessible: ${inputPath}`, err);
    throw new Error(`Source file not accessible: ${inputPath}`);
  }

  // Create output directories if they don't exist
  const outputDir = path.dirname(outputPath);
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Ensured output directory exists: ${outputDir}`);
  } catch (err) {
    console.error(`Failed to create output directory: ${outputDir}`, err);
  }

  return new Promise((resolve, reject) => {
    // Use system temp directory for temporary files - this avoids SD card write permission issues
    const tempFileName = `esp32_pcm_${Date.now()}_${path.basename(outputPath)}.temp`;
    const tempFile = path.join(os.tmpdir(), tempFileName);
    // Register this temp file for later cleanup
    registerTempFile(tempFile);
    console.log(`Using temporary file in system temp directory: ${tempFile}`);

    console.log(`Starting FFmpeg conversion: ${inputPath} -> ${tempFile}`);

    // We already checked if the input file exists earlier in the function

    ffmpeg(inputPath)
      .output(tempFile)
      .format('s16le')         // Explicitly set output format to raw PCM
      .audioCodec('pcm_s16le')
      .audioChannels(2)
      .audioFrequency(44100)
      .audioFilters([
        'aresample=resampler=soxr:precision=33:osf=s32',
        'aformat=sample_fmts=s16:dither_method=triangular'
      ])
      .on('start', (commandLine) => {
        console.log(`FFmpeg started with command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        console.log(`FFmpeg progress: ${progress.percent?.toFixed(1)}% done`);
      })
      .on('stderr', (stderrLine) => {
        console.log(`FFmpeg stderr: ${stderrLine}`);
      })
      .on('end', async () => {
        try {
          console.log(`FFmpeg conversion completed, checking temp file: ${tempFile}`);

          // Verify the temp file exists and has content
          try {
            const tempStats = await fs.stat(tempFile);
            if (tempStats.size === 0) {
              throw new Error('Temp file is empty');
            }
            console.log(`Temp file exists and has size: ${tempStats.size} bytes`);
          } catch (err) {
            console.error(`Temp file verification failed:`, err);
            reject(new Error(`FFmpeg output file verification failed: ${err.message}`));
            return;
          }

          // Read the PCM data from the temp file
          const pcmData = await fs.readFile(tempFile);
          console.log(`Read ${pcmData.length} bytes from temp file`);

          // Create custom header
          const header = createPCMHeader(44100, 16, 2, pcmData.length);
          console.log(`Created ESP32 PCM header (${header.length} bytes)`);

          // Write the final file with header + PCM data
          const finalFile = Buffer.concat([header, pcmData]);
          console.log(`Writing ${finalFile.length} bytes to final file: ${outputPath}`);

          // Try to write to the SD card with more explicit error handling
          try {
            await fs.writeFile(outputPath, finalFile);

            // Verify the file was written and has the correct size
            try {
              const outStats = await fs.stat(outputPath);
              if (outStats.size !== finalFile.length) {
                throw new Error(`Output file size mismatch: expected ${finalFile.length} but got ${outStats.size} bytes`);
              }
              console.log(`Successfully created output file: ${outputPath} with ${outStats.size} bytes`);
            } catch (statErr) {
              console.error(`Failed to verify output file: ${outputPath}`, statErr);
              reject(new Error(`Failed to verify output file: ${statErr.message}`));
              return;
            }
          } catch (writeErr) {
            console.error(`Failed to write output file to SD card: ${outputPath}`, writeErr);

            // Provide detailed error message based on error type
            if (writeErr.code === 'ENOSPC') {
              reject(new Error(`SD card is full. No space left for file: ${outputPath}`));
            } else if (writeErr.code === 'EROFS' || writeErr.code === 'EPERM') {
              reject(new Error(`SD card is write-protected or read-only: ${writeErr.message}`));
            } else {
              reject(new Error(`Failed to write to SD card: ${writeErr.message}`));
            }
            return;
          }

          // We'll clean up all temp files at the end of the conversion process

          resolve();
        } catch (error) {
          console.error(`Error in conversion process:`, error);
          reject(error);
        }
      })
      .on('error', (err) => {
        console.error(`FFmpeg error:`, err);
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .run();
  });
}

// Check if FFmpeg is installed
function checkFFmpeg() {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        console.error('FFmpeg not found or not working properly!');
        console.error('Please install FFmpeg (https://ffmpeg.org/download.html) to use this application.');
        console.error('Error details:', err);
        reject(err);
      } else {
        console.log('FFmpeg is installed and working properly.');
        resolve(formats);
      }
    });
  });
}

// Test if a directory is writable
async function testDirectoryWritable(dirPath) {
  console.log(`Testing if directory is writable: ${dirPath}`);
  const testFile = path.join(dirPath, `.write_test_${Date.now()}.tmp`);

  try {
    // Try to write a test file
    await fs.writeFile(testFile, 'test');
    console.log(`Test file written successfully: ${testFile}`);

    // Clean up
    await fs.unlink(testFile);
    console.log(`Test file deleted successfully`);

    return true;
  } catch (err) {
    console.error(`Directory write test failed: ${err.message}`);
    return false;
  }
}

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  try {
    await checkFFmpeg();
  } catch (error) {
    console.error('Warning: Application may not work correctly without FFmpeg');
  }
});