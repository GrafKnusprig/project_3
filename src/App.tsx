import React, { useState } from 'react';
import FileExplorer from './components/FileExplorer';
import MusicLibrary from './components/MusicLibrary';
import DeviceManager from './components/DeviceManager';
import ConversionProgress from './components/ConversionProgress';
import { Music2 } from 'lucide-react';
import { FileItem, StorageDevice, api } from './services/api';

interface ConversionStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  details?: string;
}

function App() {
  const [libraryItems, setLibraryItems] = useState<FileItem[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<StorageDevice | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [conversionSteps, setConversionSteps] = useState<ConversionStep[]>([]);

  const handleAddToLibrary = (item: FileItem) => {
    if (item.type === 'folder') {
      // Add all audio files from the folder
      const addAudioFiles = (folderItem: FileItem) => {
        if (folderItem.children) {
          folderItem.children.forEach(child => {
            if (child.isAudio && !libraryItems.find(libItem => libItem.id === child.id)) {
              setLibraryItems(prev => [...prev, child]);
            } else if (child.type === 'folder') {
              addAudioFiles(child);
            }
          });
        }
      };
      addAudioFiles(item);
    } else if (item.isAudio) {
      // Add single audio file
      if (!libraryItems.find(libItem => libItem.id === item.id)) {
        setLibraryItems(prev => [...prev, item]);
      }
    }
  };

  const handleRemoveFromLibrary = (id: string) => {
    setLibraryItems(prev => prev.filter(item => item.id !== id));
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
      // Start the conversion process
      const stream = await api.convertAndFlash(libraryItems, selectedDevice.mountPath, {
        // You can define your custom library structure here
        folders: [],
        files: libraryItems.map(item => ({
          id: item.id,
          name: item.name,
          path: item.path
        }))
      });

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