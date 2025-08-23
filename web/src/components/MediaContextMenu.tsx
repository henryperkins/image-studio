import { useState, useRef, useEffect } from 'react';
import { LibraryItem, isVideoItem } from '../lib/api';
import { MediaAction } from '../hooks/useMediaActions';

interface MediaContextMenuProps {
  item: LibraryItem;
  position: { x: number; y: number };
  onClose: () => void;
  onAction: (action: MediaAction, item: LibraryItem) => void;
  availableActions?: MediaAction[];
}

export default function MediaContextMenu({
  item,
  position,
  onClose,
  onAction,
  availableActions = ['view', 'edit', 'delete', 'analyze', 'download', 'copy-prompt']
}: MediaContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPosition, setMenuPosition] = useState(position);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Calculate position to keep menu in viewport
  useEffect(() => {
    if (!menuRef.current) return;
    
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    
    let newX = position.x;
    let newY = position.y;
    
    // Adjust horizontal position
    if (position.x + rect.width > viewportWidth) {
      newX = Math.max(10, viewportWidth - rect.width - 10);
    }
    
    // Adjust vertical position
    if (position.y + rect.height > viewportHeight) {
      newY = Math.max(10, viewportHeight - rect.height - 10);
    }
    
    // Account for scroll
    newX += scrollX;
    newY += scrollY;
    
    setMenuPosition({ x: newX, y: newY });
  }, [position]);

  const handleMenuAction = (action: MediaAction) => {
    if (action === 'delete' && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onAction(action, item);
    onClose();
  };

  const isVideo = isVideoItem(item);

  const menuItems = [
    { action: 'view' as const, label: '👁 View', show: !isVideo && availableActions.includes('view') },
    { action: 'edit' as const, label: '✏️ Edit', show: availableActions.includes('edit') },
    { action: 'analyze' as const, label: '🔍 Analyze', show: !isVideo && availableActions.includes('analyze') },
    { action: 'use-in-sora' as const, label: '🎬 Use in Sora', show: !isVideo && availableActions.includes('use-in-sora') },
    { action: 'download' as const, label: '⬇️ Download', show: availableActions.includes('download') },
    { action: 'copy-prompt' as const, label: '📝 Copy Prompt', show: availableActions.includes('copy-prompt') },
    { action: 'delete' as const, label: confirmDelete ? '⚠️ Confirm Delete?' : '🗑️ Delete', show: availableActions.includes('delete'), danger: true },
  ];

  const visibleItems = menuItems.filter(item => item.show);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl py-1 min-w-[180px] animate-fade-in"
      style={{
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
      }}
      role="menu"
      aria-label="Media context menu"
    >
      {visibleItems.map((menuItem, index) => (
        <button
          key={menuItem.action}
          className={`w-full text-left px-4 py-2 hover:bg-neutral-800 transition-colors duration-200 min-h-[44px] md:min-h-0 flex items-center ${
            menuItem.danger ? 'text-red-400 hover:bg-red-900/20' : 'text-white'
          } ${index === 0 ? 'rounded-t-lg' : ''} ${index === visibleItems.length - 1 ? 'rounded-b-lg' : ''}`}
          onClick={() => handleMenuAction(menuItem.action)}
          role="menuitem"
        >
          {menuItem.label}
        </button>
      ))}
      
      <div className="border-t border-neutral-700 mt-1 pt-1 px-4 py-2">
        <div className="text-xs text-neutral-500 select-none">
          {isVideo ? 'Video' : 'Image'} • {item.id.slice(0, 8)}
          {!isVideo && item.size && (
            <div>{item.size}</div>
          )}
          {isVideo && (item as any).duration && (
            <div>{(item as any).duration}s • {(item as any).width}×{(item as any).height}</div>
          )}
        </div>
      </div>
    </div>
  );
}