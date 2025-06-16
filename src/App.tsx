import React, { useState, useEffect } from 'react';
import FileExplorer from './components/FileExplorer';
import MusicLibrary from './components/MusicLibrary';
import DeviceManager from './components/DeviceManager';
import ConversionProgress from './components/ConversionProgress';
import { Music2 } from 'lucide-react';
import { FileItem, StorageDevice, api } from './services/api';
import { v4 as uuidv4 } from 'uuid';
import { 
  LibraryItem, 
  fileItemToLibraryItem, 
  generateUniqueName, 
  autoSaveLibrary, 
  loadAutoSavedLibrary, 
  generateIndexFileStructure,
  clearAutoSavedLibrary
} from './services/libraryManager';

interface ConversionStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  details?: string;
}

function App() {
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<StorageDevice | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [conversionSteps, setConversionSteps] = useState<ConversionStep[]>([]);

  // Load auto-saved library on app start
  useEffect(() => {
    const savedLibrary = loadAutoSavedLibrary();
    if (savedLibrary) {
      setLibraryItems(savedLibrary);
    }
  }, []);

  // Auto-save library whenever it changes
  useEffect(() => {
    if (libraryItems.length > 0) {
      autoSaveLibrary(libraryItems);
    }
  }, [libraryItems]);

  const handleAddToLibrary = (item: FileItem) => {
    // For single audio file addition
    if (item.type === 'file' && item.isAudio) {
      if (!libraryItems.find(li => li.path === item.path)) {
        const libItem = fileItemToLibraryItem(item, undefined, false);
        setLibraryItems(prev => [...prev, libItem]);
      }
      return;
    }
    
    // For folder addition, we'll use a simple non-recursive approach
    if (item.type === 'folder') {
      console.log(`Adding folder to library:`, {
        name: item.name,
        path: item.path, 
        isSpecial: item.special,
        isSystem: item.systemDir
      });
      
      // Step 1: Create the root folder item
      const rootFolderId = uuidv4();
      const rootFolderItem: LibraryItem = {
        id: rootFolderId,
        name: item.name,
        type: 'folder',
        path: item.path,
        parent: undefined, // This is a root level folder
      };
      
      // Step 2: Fetch the contents directly from the API
      api.getFileSystem(item.path)
        .then(contents => {      // Step 3: Filter out parent entries, system folders, and the special "Home Directory" folder
      const validItems = contents.filter(content => 
        !content.isParent && 
        !content.systemDir && 
        !content.accessDenied &&
        !content.special && // Filter out special directories like "Home Directory"
        (content.isAudio || content.type === 'folder')
      );
          
          // Step 4: Prepare batch update to minimize state changes
          const newItems: LibraryItem[] = [rootFolderItem];
          
          // Step 5: Process each item (non-recursively)
          validItems.forEach(content => {
            if (content.isAudio) {
              // Add audio file as direct child of the folder
              const audioItem: LibraryItem = {
                id: uuidv4(),
                name: content.name,
                type: 'file',
                path: content.path,
                parent: rootFolderId,
                isAudio: true,
                size: content.size
              };
              
              newItems.push(audioItem);
            }
            else if (content.type === 'folder') {
              // For subfolders, we add them but don't go deeper
              // Users can click on these subfolders to add their contents later
              const subfolderItem: LibraryItem = {
                id: uuidv4(),
                name: content.name,
                type: 'folder',
                path: content.path,
                parent: rootFolderId
              };
              
              newItems.push(subfolderItem);
            }
          });
          
          // Step 6: Add all new items in a single batch update
          if (newItems.length > 0) {
            console.log(`Adding ${newItems.length} items to library:`, {
              folderName: item.name,
              validItemsCount: validItems.length,
              filtered: contents.length - validItems.length,
              details: `Added ${newItems.filter(i => i.type === 'folder').length} folders, ${newItems.filter(i => i.type === 'file').length} files`
            });
            setLibraryItems(prevItems => [...prevItems, ...newItems]);
          } else {
            console.log('No valid items found in the folder:', {
              folderName: item.name,
              path: item.path
            });
          }
        })
        .catch(error => {
          console.error(`Failed to load contents of ${item.path}:`, error);
        });
    }
  };

  const handleRemoveFromLibrary = (id: string) => {
    console.log(`Removing item with id: ${id}`);
    
    // Find the item to be removed
    const itemToRemove = libraryItems.find(item => item.id === id);
    
    if (!itemToRemove) {
      console.error(`Item with id ${id} not found in library`);
      return;
    }
    
    console.log(`Found item to remove: ${itemToRemove.name}, type: ${itemToRemove.type}`);
    
    // Simple approach: Use a flat filter operation
    if (itemToRemove.type === 'file') {
      // For files, just remove the specific file
      setLibraryItems(prev => prev.filter(item => item.id !== id));
    } else {
      // For folders, remove the folder and all items with this folder as ancestor
      setLibraryItems(prev => {
        // Create a function to check if an item is a descendant of the folder
        const isDescendantOf = (item: LibraryItem, folderId: string): boolean => {
          if (!item.parent) return false;
          if (item.parent === folderId) return true;
          
          // Find the parent item and check recursively
          const parentItem = prev.find(p => p.id === item.parent);
          if (!parentItem) return false;
          
          return isDescendantOf(parentItem, folderId);
        };
        
        // Filter out the folder itself and all its descendants
        return prev.filter(item => {
          // Keep items that:
          // 1. Are not the folder we're deleting
          // 2. Are not direct children of the folder (parent === folderId)
          // 3. Are not descendants of the folder
          return (
            item.id !== id && 
            item.parent !== id && 
            !isDescendantOf(item, id)
          );
        });
      });
    }
  };
  
  const handleAddVirtualFolder = (folder: LibraryItem) => {
    setLibraryItems(prev => [...prev, folder]);
  };
  
  const handleMoveItem = (itemId: string, targetFolderId: string | undefined) => {
    // Find the item to be moved
    const itemToMove = libraryItems.find(item => item.id === itemId);
    
    if (!itemToMove) return;
    
    // Check if target folder exists or is root (undefined)
    if (targetFolderId !== undefined && !libraryItems.find(item => item.id === targetFolderId && item.type === 'folder')) {
      return;
    }
    
    // Check if name exists in the destination folder
    const itemsInDestination = libraryItems.filter(item => 
      item.parent === targetFolderId && item.type === itemToMove.type
    );
    const existingNames = itemsInDestination.map(item => item.name);
    
    // Update the item's parent
    setLibraryItems(prev => prev.map(item => {
      if (item.id === itemId) {
        // Rename if needed
        let name = item.name;
        if (existingNames.includes(name)) {
          name = generateUniqueName(name, existingNames);
        }
        
        return {
          ...item,
          parent: targetFolderId,
          name
        };
      }
      return item;
    }));
  };
  
  const handleSaveLibrary = () => {
    // Autosave is already handled by useEffect
    // This function is for the explicit save action
    autoSaveLibrary(libraryItems);
  };
  
  const handleLoadLibrary = (loadedItems: LibraryItem[]) => {
    setLibraryItems(loadedItems);
  };
  
  const handleRenameItem = (id: string, newName: string) => {
    setLibraryItems(prev => prev.map(item => 
      item.id === id ? { ...item, name: newName } : item
    ));
  };

  const handleStartConversion = async () => {
    if (!selectedDevice || libraryItems.length === 0) return;

    setIsConverting(true);
    setShowProgress(true);

    const steps: ConversionStep[] = [
      { id: '1', name: 'Scanning audio files', status: 'pending', progress: 0 },
      { id: '2', name: 'Converting to PCM format', status: 'pending', progress: 0 },
      { id: '3', name: 'Adding custom headers', status: 'pending', progress: 0 },
      { id: '4', name: 'Creating index file', status: 'pending', progress: 0 },
      { id: '5', name: 'Flashing to device', status: 'pending', progress: 0 },
    ];

    setConversionSteps(steps);

    try {
      // Generate the index file structure
      const indexStructure = generateIndexFileStructure(libraryItems);
      
      // Start the conversion process
      // Make sure to include all audio files in the library
      const audioFiles = libraryItems.filter(item => item.type === 'file' && item.isAudio);
      
      // Double-check that files exist and have full path information
      for (const file of audioFiles) {
        if (!file.path) {
          console.error(`File ${file.name} has no path information!`, file);
        }
      }
      
      console.log(`Starting conversion of ${audioFiles.length} audio files to device ${selectedDevice.name}`);
      console.log(`Audio files:`, audioFiles);
      console.log(`Index structure:`, indexStructure);
      
      const stream = await api.convertAndFlash(
        audioFiles,
        selectedDevice.mountPath, 
        indexStructure
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();

      let currentStepIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'progress') {
              // Update current step
              if (currentStepIndex < steps.length) {
                const updatedSteps = [...steps];
                updatedSteps[currentStepIndex].status = 'processing';
                updatedSteps[currentStepIndex].progress = data.progress;
                updatedSteps[currentStepIndex].details = `Processing ${data.file}...`;
                setConversionSteps(updatedSteps);
              }
            } else if (data.type === 'complete') {
              // Mark all steps as completed
              const updatedSteps = steps.map(step => ({
                ...step,
                status: 'completed' as const,
                progress: 100,
                details: 'Completed successfully'
              }));
              setConversionSteps(updatedSteps);
            } else if (data.type === 'error') {
              // Mark current step as error
              if (currentStepIndex < steps.length) {
                const updatedSteps = [...steps];
                updatedSteps[currentStepIndex].status = 'error';
                updatedSteps[currentStepIndex].details = data.error;
                setConversionSteps(updatedSteps);
              }
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }

    } catch (error) {
      console.error('Conversion failed:', error);
      const updatedSteps = [...steps];
      updatedSteps[0].status = 'error';
      updatedSteps[0].details = error instanceof Error ? error.message : 'Conversion failed';
      setConversionSteps(updatedSteps);
    } finally {
      setIsConverting(false);
    }
  };

  const handleClearLibrary = () => {
    clearAutoSavedLibrary();
    setLibraryItems([]);
  };
  
  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-300 px-6 py-4">
        <div className="flex items-center">
          <Music2 size={24} className="text-blue-600 mr-3" />
          <h1 className="text-xl font-semibold text-gray-800">ESP Tunes</h1>
          <span className="ml-2 text-sm text-gray-500">Audio Converter & Flash Tool for ESP32 music player</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel - File Explorer */}
        <div className="w-1/3 min-w-0">
          <FileExplorer onAddToLibrary={handleAddToLibrary} />
        </div>

        {/* Right Panel - Library & Device Manager */}
        <div className="w-2/3 flex flex-col min-w-0">
          {/* Music Library */}
          <div className="flex-1 min-h-0">
            <MusicLibrary
              libraryItems={libraryItems}
              onRemoveItem={handleRemoveFromLibrary}
              onReorderItems={setLibraryItems}
              onAddVirtualFolder={handleAddVirtualFolder}
              onMoveItem={handleMoveItem}
              onSaveLibrary={handleSaveLibrary}
              onLoadLibrary={handleLoadLibrary}
              onRenameItem={handleRenameItem}
              onClearLibrary={handleClearLibrary}
            />
          </div>

          {/* Device Manager */}
          <div className="h-64 border-t border-gray-300">
            <DeviceManager
              onDeviceSelect={setSelectedDevice}
              selectedDevice={selectedDevice}
              onStartConversion={handleStartConversion}
              isConverting={isConverting}
            />
          </div>
        </div>
      </div>

      {/* Conversion Progress Modal */}
      <ConversionProgress
        isVisible={showProgress}
        steps={conversionSteps}
        onClose={() => setShowProgress(false)}
      />

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-200 px-6 py-3">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <div>
            Ready to convert {libraryItems.length} audio files
            {selectedDevice && ` to ${selectedDevice.name}`}
          </div>
          <div className="flex items-center space-x-4">
            <span>Supports: MP3, FLAC, WAV, M4A, OGG</span>
            <span>Output: PCM with custom headers for ESP32</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;