import { v4 as uuidv4 } from 'uuid';
import { FileItem } from './api';

export interface LibraryItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  parent?: string;
  isAudio?: boolean;
  isVirtual?: boolean;
  size?: string;
  children?: LibraryItem[];
}

export interface MusicLibrary {
  items: LibraryItem[];
  version: string;
  lastSaved: string;
}

const AUTOSAVE_KEY = 'esp32-music-manager-autosave';

// Helper function to create a virtual folder
export const createVirtualFolder = (name: string, parent?: string): LibraryItem => {
  return {
    id: uuidv4(),
    name,
    type: 'folder',
    path: '', // Virtual folders don't have a real path
    parent,
    isVirtual: true,
    children: []
  };
};

// Convert a FileItem to a LibraryItem
export const fileItemToLibraryItem = (item: FileItem, parent?: string, processChildren: boolean = false): LibraryItem => {
  return {
    id: item.id || uuidv4(),
    name: item.name,
    type: item.type,
    path: item.path,
    parent,
    isAudio: item.isAudio,
    size: item.size,
    children: processChildren && item.children ? 
      item.children.map(child => fileItemToLibraryItem(child, item.id, false)) : 
      undefined
  };
};

// Save library to local storage for auto-save
export const autoSaveLibrary = (items: LibraryItem[]): void => {
  const library: MusicLibrary = {
    items,
    version: '1.0',
    lastSaved: new Date().toISOString()
  };
  
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(library));
  } catch (error) {
    console.error('Failed to auto-save library:', error);
  }
};

// Load library from auto-save
export const loadAutoSavedLibrary = (): LibraryItem[] | null => {
  try {
    const savedData = localStorage.getItem(AUTOSAVE_KEY);
    if (!savedData) return null;
    
    const library = JSON.parse(savedData) as MusicLibrary;
    return library.items;
  } catch (error) {
    console.error('Failed to load auto-saved library:', error);
    return null;
  }
};

// Clear autosaved library data
export const clearAutoSavedLibrary = (): void => {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    console.log('Autosaved library data cleared successfully');
  } catch (error) {
    console.error('Failed to clear autosaved library:', error);
  }
};

// Generate a unique name for a file or folder if there are duplicates
export const generateUniqueName = (name: string, existingNames: string[]): string => {
  if (!existingNames.includes(name)) return name;
  
  // For files with extensions
  const extension = name.includes('.') ? name.substring(name.lastIndexOf('.')) : '';
  const baseName = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;
  
  let counter = 1;
  let newName = '';
  
  do {
    newName = `${baseName} (${counter})${extension}`;
    counter++;
  } while (existingNames.includes(newName));
  
  return newName;
};

// Save library to a downloadable file
export const saveLibraryToFile = (items: LibraryItem[]): void => {
  const library: MusicLibrary = {
    items,
    version: '1.0',
    lastSaved: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `esp32-music-library-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Load library from a file
export const loadLibraryFromFile = async (file: File): Promise<LibraryItem[] | null> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const result = event.target?.result as string;
        const library = JSON.parse(result) as MusicLibrary;
        resolve(library.items);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsText(file);
  });
};

// Helper function to generate an index file structure based on the library
export const generateIndexFileStructure = (items: LibraryItem[]) => {
  const allMusicFiles: { path: string, name: string }[] = [];
  const musicFolders: { name: string, files: { path: string, name: string }[] }[] = [];
  
  // Map to store folder information
  const folderMap = new Map<string, { 
    name: string,
    id: string,
    files: { path: string, name: string }[] 
  }>();
  
  // First, collect all folders
  items.forEach(item => {
    if (item.type === 'folder') {
      folderMap.set(item.id, {
        name: item.name,
        id: item.id,
        files: []
      });
    }
  });
  
  // Add root folder
  folderMap.set('root', {
    name: 'Root',
    id: 'root',
    files: []
  });
  
  // Then, assign files to their respective folders
  items.forEach(item => {
    if (item.type === 'file' && item.isAudio) {
      // Add to all music files list
      allMusicFiles.push({ path: item.path, name: item.name });
      
      // Add to appropriate folder
      const folderId = item.parent || 'root';
      const folder = folderMap.get(folderId);
      if (folder) {
        folder.files.push({ path: item.path, name: item.name });
      }
    }
  });
  
  // Create the music folders list from the folders that have music files
  folderMap.forEach((folder) => {
    if (folder.files.length > 0) {
      musicFolders.push({
        name: folder.name,
        files: folder.files
      });
    }
  });
  
  return {
    version: '1.0',
    totalFiles: allMusicFiles.length,
    allFiles: allMusicFiles, // Flat list of all music files
    musicFolders // Folders with their music files
  };
};
