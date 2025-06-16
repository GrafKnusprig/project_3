import { LibraryItem } from './libraryManager';

const API_BASE = '/api';  // Using proxy in vite.config.ts

export interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  children?: FileItem[];
  isAudio?: boolean;
  isParent?: boolean;
  special?: boolean;
  error?: string;
  accessDenied?: boolean;
  hasChildren?: boolean;
  systemDir?: boolean;
  size?: string;
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

export interface IndexFileStructure {
  version: string;
  totalFiles: number;
  allFiles: { path: string; name: string }[];
  musicFolders: { name: string; files: { path: string; name: string }[] }[];
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

  async convertAndFlash(files: LibraryItem[], devicePath: string, libraryStructure: IndexFileStructure): Promise<ReadableStream> {
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