import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SD_ROOT = path.join(__dirname, 'test_sdcard');
const TEST_MUSIC = path.join(__dirname, 'test_music');

// Helper to clean up test directories
async function cleanDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}

describe('/api/convert-and-flash sync logic', () => {
  let app;
  let request;
  beforeAll(async () => {
    process.env.MOCK_PCM = '1'; // Enable PCM mock for fast tests
    const mod = await import(path.resolve(__dirname, '../server/index.js'));
    app = mod.default || mod.app || mod;
    request = (await import('supertest')).default;

    await cleanDir(TEST_SD_ROOT);
    await cleanDir(TEST_MUSIC);
    await fs.mkdir(TEST_SD_ROOT, { recursive: true });
    await fs.mkdir(TEST_MUSIC, { recursive: true });
    // Create some fake music files
    await fs.writeFile(path.join(TEST_MUSIC, 'song1.mp3'), 'dummy');
    await fs.writeFile(path.join(TEST_MUSIC, 'song2.mp3'), 'dummy');
  });

  afterAll(async () => {
    await cleanDir(TEST_SD_ROOT);
    await cleanDir(TEST_MUSIC);
  });

  it('should only convert/copy new files and remove deleted files', async () => {
    // Initial library structure
    const libraryStructure = {
      musicFolders: [
        { name: 'Pop', files: [{ name: 'song1.mp3', path: path.join(TEST_MUSIC, 'song1.mp3') }] },
        { name: 'Rock', files: [{ name: 'song2.mp3', path: path.join(TEST_MUSIC, 'song2.mp3') }] }
      ]
    };
    const files = [
      { name: 'song1.mp3', path: path.join(TEST_MUSIC, 'song1.mp3'), isAudio: true },
      { name: 'song2.mp3', path: path.join(TEST_MUSIC, 'song2.mp3'), isAudio: true }
    ];
    // First sync
    const res1 = await request(app)
      .post('/api/convert-and-flash')
      .send({ files, devicePath: TEST_SD_ROOT, libraryStructure })
      .expect(200);
    // PCM files should exist in correct folders
    const popPcm = path.join(TEST_SD_ROOT, 'ESP32_MUSIC', 'Pop', 'song1.pcm');
    const rockPcm = path.join(TEST_SD_ROOT, 'ESP32_MUSIC', 'Rock', 'song2.pcm');
    expect(await fs.stat(popPcm)).toBeTruthy();
    expect(await fs.stat(rockPcm)).toBeTruthy();
    // Remove song2 from library
    const libraryStructure2 = {
      musicFolders: [
        { name: 'Pop', files: [{ name: 'song1.mp3', path: path.join(TEST_MUSIC, 'song1.mp3') }] }
      ]
    };
    const files2 = [
      { name: 'song1.mp3', path: path.join(TEST_MUSIC, 'song1.mp3'), isAudio: true }
    ];
    // Second sync
    await request(app)
      .post('/api/convert-and-flash')
      .send({ files: files2, devicePath: TEST_SD_ROOT, libraryStructure: libraryStructure2 })
      .expect(200);
    // song2.pcm should be removed
    await expect(fs.stat(rockPcm)).rejects.toThrow();
    // song1.pcm should still exist
    expect(await fs.stat(popPcm)).toBeTruthy();
  });
});
