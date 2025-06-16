import React from 'react';
import { Trash2, FolderTree, Music } from 'lucide-react';

interface LibraryItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  parent?: string;
  isAudio?: boolean;
}

interface MusicLibraryProps {
  libraryItems: LibraryItem[];
  onRemoveItem: (id: string) => void;
  onReorderItems: (items: LibraryItem[]) => void;
}

const MusicLibrary: React.FC<MusicLibraryProps> = ({ 
  libraryItems, 
  onRemoveItem, 
  onReorderItems 
}) => {
  const renderLibraryItem = (item: LibraryItem) => {
    return (
      <div
        key={item.id}
        className="flex items-center py-2 px-3 border-b border-gray-100 hover:bg-gray-50 group"
      >
        <div className="flex items-center flex-1 min-w-0">
          {item.type === 'folder' ? (
            <FolderTree size={16} className="mr-3 text-yellow-600 flex-shrink-0" />
          ) : (
            <Music size={16} className="mr-3 text-blue-600 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate">{item.name}</div>
            <div className="text-xs text-gray-500 truncate">{item.path}</div>
          </div>
        </div>
        <button
          onClick={() => onRemoveItem(item.id)}
          className="ml-2 p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove from library"
        >
          <Trash2 size={14} className="text-red-600" />
        </button>
      </div>
    );
  };

  return (
    <div className="h-full bg-white">
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-800">Music Library</h3>
        <p className="text-xs text-gray-600 mt-1">
          {libraryItems.length} items selected
        </p>
      </div>
      <div className="overflow-y-auto h-full">
        {libraryItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <Music size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No music selected</p>
              <p className="text-xs">Add files from the explorer</p>
            </div>
          </div>
        ) : (
          libraryItems.map(renderLibraryItem)
        )}
      </div>
    </div>
  );
};

export default MusicLibrary;