import React, { useState, useEffect } from 'react';
import { Folder, File, Music, Plus, RefreshCw } from 'lucide-react';
import { api, FileItem } from '../services/api';

interface FileExplorerProps {
  onAddToLibrary: (item: FileItem) => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ onAddToLibrary }) => {
  const [fileSystem, setFileSystem] = useState<FileItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFileSystem = async (path?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFileSystem(path);
      setFileSystem(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load filesystem');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFileSystem();
  }, []);

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFileItem = (item: FileItem, depth: number = 0) => {
    const isExpanded = expandedFolders.has(item.id);
    const paddingLeft = depth * 20;

    return (
      <div key={item.id}>
        <div
          className={`flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer select-none ${
            item.isAudio ? 'text-blue-600' : ''
          }`}
          style={{ paddingLeft: `${paddingLeft + 8}px` }}
          onClick={() => {
            if (item.type === 'folder') {
              toggleFolder(item.id);
            }
          }}
        >
          <div className="flex items-center flex-1 min-w-0">
            {item.type === 'folder' ? (
              <Folder size={16} className="mr-2 text-yellow-600 flex-shrink-0" />
            ) : item.isAudio ? (
              <Music size={16} className="mr-2 text-blue-600 flex-shrink-0" />
            ) : (
              <File size={16} className="mr-2 text-gray-500 flex-shrink-0" />
            )}
            <span className="truncate text-sm">{item.name}</span>
          </div>
          {(item.type === 'folder' || item.isAudio) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToLibrary(item);
              }}
              className="ml-2 p-1 rounded hover:bg-blue-100 flex-shrink-0"
              title="Add to library"
            >
              <Plus size={14} className="text-blue-600" />
            </button>
          )}
        </div>
        {item.type === 'folder' && isExpanded && item.children && (
          <div>
            {item.children.map(child => renderFileItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full border-r border-gray-300 bg-white">
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">File Explorer</h3>
          <button
            onClick={() => loadFileSystem()}
            className="p-1 rounded hover:bg-gray-200"
            title="Refresh"
          >
            <RefreshCw size={16} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto h-full">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
              <p className="text-sm">Loading filesystem...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-500">
            <div className="text-center">
              <p className="text-sm">Error: {error}</p>
              <button
                onClick={() => loadFileSystem()}
                className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          fileSystem.map(item => renderFileItem(item))
        )}
      </div>
    </div>
  );
};

export default FileExplorer;