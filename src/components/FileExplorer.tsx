import React, { useState, useEffect } from 'react';
import { Folder, File, Music, Plus, RefreshCw, ArrowLeft, Home, AlertTriangle } from 'lucide-react';
import { api, FileItem } from '../services/api';

interface FileExplorerProps {
  onAddToLibrary: (item: FileItem) => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ onAddToLibrary }) => {
  const [fileSystem, setFileSystem] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [folderContents, setFolderContents] = useState<Record<string, FileItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{name: string, path: string}[]>([]);

  const loadFileSystem = async (path?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await api.getFileSystem(path);
      
      if (path) {
        setCurrentPath(path);
        setFolderContents(prev => ({
          ...prev,
          [path]: data
        }));
        
        // Create breadcrumbs
        const parts = path.split('/').filter(Boolean);
        const breadcrumbItems = [];
        let currentBreadcrumbPath = '';
        
        // Add root if we're not at root
        if (path !== '/') {
          breadcrumbItems.push({ name: 'Root', path: '/' });
        }
        
        // Build path parts
        for (let i = 0; i < parts.length; i++) {
          currentBreadcrumbPath += '/' + parts[i];
          breadcrumbItems.push({
            name: parts[i],
            path: currentBreadcrumbPath
          });
        }
        
        setBreadcrumbs(breadcrumbItems);
      } else {
        setCurrentPath('');
        setBreadcrumbs([]);
        setFileSystem(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load filesystem');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFileSystem();
  }, []);

  const navigateToFolder = (folderPath: string) => {
    loadFileSystem(folderPath);
  };

  const renderFileItem = (item: FileItem) => {
    // Determine the icon to display
    let icon;
    if (item.type === 'folder') {
      if (item.isParent) {
        icon = <ArrowLeft size={16} className="mr-2 text-gray-600 flex-shrink-0" />;
      } else if (item.special) {
        icon = <Home size={16} className="mr-2 text-indigo-600 flex-shrink-0" />;
      } else {
        icon = <Folder size={16} className="mr-2 text-yellow-600 flex-shrink-0" />;
      }
    } else if (item.isAudio) {
      icon = <Music size={16} className="mr-2 text-blue-600 flex-shrink-0" />;
    } else {
      icon = <File size={16} className="mr-2 text-gray-500 flex-shrink-0" />;
    }

    // Determine if there's an error
    const hasError = item.error || item.accessDenied;

    return (
      <div 
        key={item.id}
        className={`flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer select-none ${
          item.isAudio ? 'text-blue-600' : hasError ? 'text-red-500' : item.special ? 'text-indigo-600 italic' : ''
        }`}
        onClick={() => {
          if (item.type === 'folder') {
            navigateToFolder(item.path);
          }
        }}
      >
        <div className="flex items-center flex-1 min-w-0">
          {icon}
          <span className="truncate text-sm">{item.name}</span>
          {hasError && (
            <span title={item.error}>
              <AlertTriangle size={14} className="ml-2 text-red-500" />
            </span>
          )}
          {item.size && (
            <span className="ml-2 text-xs text-gray-500">{item.size}</span>
          )}
        </div>
        {(item.type === 'folder' || item.isAudio) && !hasError && !item.special && !item.isParent && (
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
    );
  };

  return (
    <div className="h-full border-r border-gray-300 bg-white">
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">File Explorer</h3>
          <button
            onClick={() => loadFileSystem(currentPath || undefined)}
            className="p-1 rounded hover:bg-gray-200"
            title="Refresh"
          >
            <RefreshCw size={16} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {currentPath && (
          <div className="mt-2 flex items-center space-x-1 text-xs text-gray-500 overflow-x-auto pb-1">
            <button
              onClick={() => loadFileSystem()}
              className="flex items-center hover:text-blue-600"
              title="Home"
            >
              <Home size={14} />
            </button>
            
            {breadcrumbs.length > 0 && <span>/</span>}
            
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.path}>
                {index > 0 && <span>/</span>}
                <button
                  className="hover:text-blue-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px]"
                  onClick={() => navigateToFolder(crumb.path)}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
            
            {currentPath && (
              <button
                onClick={() => {
                  const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                  navigateToFolder(parentPath);
                }}
                className="ml-auto p-1 rounded-full hover:bg-gray-200 flex-shrink-0"
                title="Back to parent directory"
              >
                <ArrowLeft size={14} />
              </button>
            )}
          </div>
        )}
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
                onClick={() => loadFileSystem(currentPath || undefined)}
                className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
              >
                Retry
              </button>
            </div>
          </div>
        ) : currentPath ? (
          folderContents[currentPath]?.map(item => renderFileItem(item))
        ) : (
          fileSystem.map(item => renderFileItem(item))
        )}
      </div>
    </div>
  );
};

export default FileExplorer;
