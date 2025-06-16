const API_BASE = 'http://localhost:3001/api';

export interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  children?: FileItem[];
  isAudio?: boolean;
}

export interface StorageDevice {
  id: string;
  name: string;
  type: 'usb' | 'sd' | 'hdd';
  capacity: string;
  freeSpace: string;
  isConnected: boolean;
  mountPath: string;
}

export const api = {
  async getFileSystem(path?: string): Promise<FileItem[]> {
    const response = await fetch(`${API_BASE}/filesystem${path ? `?path=${encodeURIComponent(path)}` : ''}`);
    if (!response.ok) throw new Error('Failed to fetch filesystem');
    return response.json();
  },

  async getDevices(): Promise<StorageDevice[]> {
    const response = await fetch(`${API_BASE}/devices`);
    if (!response.ok) throw new Error('Failed to fetch devices');
    return response.json();
  },

  async convertAndFlash(files: FileItem[], devicePath: string, libraryStructure: any): Promise<ReadableStream> {
    const response = await fetch(`${API_BASE}/convert-and-flash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files,
        devicePath,
        libraryStructure
      })
    });

    if (!response.ok) throw new Error('Failed to start conversion');
    return response.body!;
  }
};