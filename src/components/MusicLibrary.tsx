import React, { useState, useRef } from 'react';
import { 
  Trash2, 
  FolderTree, 
  Music, 
  FolderPlus, 
  Save, 
  Upload, 
  MoreVertical, 
  ArrowDown, 
  ArrowUp,
  FolderInput
} from 'lucide-react';
import { LibraryItem, saveLibraryToFile, loadLibraryFromFile, createVirtualFolder, generateUniqueName } from '../services/libraryManager';

interface MusicLibraryProps {
  libraryItems: LibraryItem[];
  onRemoveItem: (id: string) => void;
  onReorderItems: (items: LibraryItem[]) => void;
  onAddVirtualFolder: (folder: LibraryItem) => void;
  onMoveItem: (itemId: string, targetFolderId: string | undefined) => void;
  onSaveLibrary: () => void;
  onLoadLibrary: (items: LibraryItem[]) => void;
  onRenameItem: (id: string, newName: string) => void;
  onClearLibrary: () => void;
}

const MusicLibrary: React.FC<MusicLibraryProps> = ({ 
  libraryItems, 
  onRemoveItem, 
  onReorderItems, 
  onAddVirtualFolder,
  onMoveItem,
  onSaveLibrary,
  onLoadLibrary,
  onRenameItem,
  onClearLibrary
}) => {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFolder = (folderId: string) => {
    const newExpandedFolders = new Set(expandedFolders);
    if (expandedFolders.has(folderId)) {
      newExpandedFolders.delete(folderId);
    } else {
      newExpandedFolders.add(folderId);
    }
    setExpandedFolders(newExpandedFolders);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggedItem(id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string | undefined) => {
    e.preventDefault();
    
    if (draggedItem && draggedItem !== targetId) {
      onMoveItem(draggedItem, targetId);
    }
    
    setDraggedItem(null);
  };

  const handleAddFolder = () => {
    const folderName = prompt('Enter folder name:');
    if (folderName) {
      const folderNames = libraryItems
        .filter(item => item.type === 'folder' && !item.parent)
        .map(item => item.name);
      
      const uniqueName = generateUniqueName(folderName, folderNames);
      const newFolder = createVirtualFolder(uniqueName);
      onAddVirtualFolder(newFolder);
    }
  };

  const handleSaveLibrary = () => {
    onSaveLibrary();
    saveLibraryToFile(libraryItems);
  };

  const handleLoadLibrary = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const loadedItems = await loadLibraryFromFile(file);
      if (loadedItems) {
        onLoadLibrary(loadedItems);
      }
    } catch (error) {
      console.error('Failed to load library:', error);
      alert('Failed to load library. Invalid file format.');
    }
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRenaming = (item: LibraryItem) => {
    setRenamingItemId(item.id);
    setNewName(item.name);
  };

  const finishRenaming = () => {
    if (renamingItemId && newName) {
      onRenameItem(renamingItemId, newName);
    }
    setRenamingItemId(null);
    setNewName('');
  };

  // Group items by parent
  const rootItems: LibraryItem[] = [];
  const itemsByParent = new Map<string, LibraryItem[]>();
  
  libraryItems.forEach(item => {
    if (!item.parent) {
      rootItems.push(item);
    } else {
      if (!itemsByParent.has(item.parent)) {
        itemsByParent.set(item.parent, []);
      }
      itemsByParent.get(item.parent)?.push(item);
    }
  });

  const renderLibraryItem = (item: LibraryItem, depth = 0) => {
    const isFolder = item.type === 'folder';
    const isExpanded = expandedFolders.has(item.id);
    const children = itemsByParent.get(item.id) || [];
    const hasChildren = children.length > 0;
    const paddingLeft = depth * 16 + 8;
    const isRenaming = renamingItemId === item.id;
    
    return (
      <React.Fragment key={item.id}>
        <div
          className={`flex items-center py-2 px-3 border-b border-gray-100 hover:bg-gray-50 group ${
            draggedItem === item.id ? 'opacity-50' : ''
          }`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          draggable
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, isFolder ? item.id : item.parent)}
        >
          <div className="flex items-center flex-1 min-w-0">
            {isFolder ? (
              <div 
                className="flex items-center cursor-pointer"
                onClick={() => toggleFolder(item.id)}
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ArrowDown size={14} className="mr-1 text-gray-500" />
                  ) : (
                    <ArrowUp size={14} className="mr-1 text-gray-500" />
                  )
                ) : (
                  <span className="w-4 mr-1"></span> // Spacer
                )}
                {item.isVirtual ? (
                  <FolderInput size={16} className="mr-3 text-indigo-600 flex-shrink-0" />
                ) : (
                  <FolderTree size={16} className="mr-3 text-yellow-600 flex-shrink-0" />
                )}
              </div>
            ) : (
              <>
                <span className="w-4 mr-1"></span> {/* Spacer */}
                <Music size={16} className="mr-3 text-blue-600 flex-shrink-0" />
              </>
            )}
            <div className="min-w-0 flex-1">
              {isRenaming ? (
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={finishRenaming}
                  onKeyDown={(e) => e.key === 'Enter' && finishRenaming()}
                  autoFocus
                  className="w-full border border-blue-400 px-1 py-0.5 text-sm rounded"
                />
              ) : (
                <div className="font-medium text-sm truncate">{item.name}</div>
              )}
              <div className="text-xs text-gray-500 truncate">
                {item.isVirtual ? 'Virtual Folder' : item.path}
              </div>
            </div>
          </div>
          <div className="flex items-center">
            {!isRenaming && (
              <>
                <button
                  onClick={() => startRenaming(item)}
                  className="ml-1 p-1 rounded hover:bg-blue-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Rename"
                >
                  <MoreVertical size={14} className="text-gray-500" />
                </button>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="ml-1 p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove from library"
                >
                  <Trash2 size={14} className="text-red-600" />
                </button>
              </>
            )}
          </div>
        </div>
        
        {/* Render children if folder is expanded */}
        {isFolder && isExpanded && hasChildren && (
          <div>
            {children.sort((a, b) => {
              // Show folders first, then sort alphabetically
              if (a.type === 'folder' && b.type !== 'folder') return -1;
              if (a.type !== 'folder' && b.type === 'folder') return 1;
              return a.name.localeCompare(b.name);
            }).map(child => renderLibraryItem(child, depth + 1))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Music Library</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleAddFolder}
              className="p-1 rounded hover:bg-gray-200"
              title="Add Folder"
            >
              <FolderPlus size={16} className="text-blue-600" />
            </button>
            <button
              onClick={handleSaveLibrary}
              className="p-1 rounded hover:bg-gray-200"
              title="Save Library"
            >
              <Save size={16} className="text-green-600" />
            </button>
            <button
              onClick={handleLoadLibrary}
              className="p-1 rounded hover:bg-gray-200"
              title="Load Library"
            >
              <Upload size={16} className="text-orange-600" />
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </button>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to clear the entire library?')) {
                  onClearLibrary();
                }
              }}
              className="p-1 rounded hover:bg-gray-200"
              title="Clear Library"
            >
              <Trash2 size={16} className="text-red-600" />
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          {libraryItems.filter(item => item.type === 'file').length} files, {libraryItems.filter(item => item.type === 'folder').length} folders
        </p>
      </div>
      <div 
        className="overflow-y-auto flex-1"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, undefined)}
      >
        {libraryItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <Music size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No music selected</p>
              <p className="text-xs">Add files or folders from the explorer</p>
            </div>
          </div>
        ) : (
          // Sort items: folders first, then files
          rootItems.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
          }).map(item => renderLibraryItem(item))
        )}
      </div>
    </div>
  );
};

export default MusicLibrary;
