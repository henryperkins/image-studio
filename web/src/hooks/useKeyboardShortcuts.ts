import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';

interface KeyboardShortcutsOptions {
  onDelete?: () => void;
  onGenerate?: () => void;
  onCommandPalette?: () => void;
  onSearch?: () => void;
  onHelp?: () => void;
  selectedIds?: string[];
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onDelete,
  onGenerate,
  onCommandPalette,
  onSearch,
  onHelp,
  selectedIds = [],
  disabled = false
}: KeyboardShortcutsOptions) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabled) return;
    
    // Check if user is typing in an input field
    const activeElement = document.activeElement;
    const isTyping = activeElement?.tagName === 'INPUT' || 
                    activeElement?.tagName === 'TEXTAREA' ||
                    (activeElement as HTMLElement)?.contentEditable === 'true';
    
    // Delete selected items (Del key)
    if (e.key === 'Delete' && !isTyping && selectedIds.length > 0) {
      e.preventDefault();
      if (onDelete) {
        if (e.shiftKey) {
          // Skip confirmation with Shift+Del
          onDelete();
        } else {
          // Show confirmation
          const count = selectedIds.length;
          const message = `Delete ${count} selected ${count === 1 ? 'item' : 'items'}?`;
          if (window.confirm(message)) {
            onDelete();
          }
        }
      }
      return;
    }
    
    // Focus search (/ key)
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping) {
      e.preventDefault();
      if (onSearch) {
        onSearch();
      } else {
        // Fallback to focusing the search input directly
        const searchInput = document.getElementById('library-search') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      return;
    }
    
    // Generate new content (g key)
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping) {
      e.preventDefault();
      if (onGenerate) {
        onGenerate();
      } else {
        // Navigate to images page and focus prompt
        navigate('/');
        setTimeout(() => {
          const promptInput = document.querySelector('textarea[placeholder*="prompt"]') as HTMLTextAreaElement;
          if (promptInput) {
            promptInput.focus();
          }
        }, 100);
      }
      return;
    }
    
    // Command palette (k key with Cmd/Ctrl)
    if (e.key === 'k' && (e.metaKey || e.ctrlKey) && !isTyping) {
      e.preventDefault();
      if (onCommandPalette) {
        onCommandPalette();
      } else {
        showToast('Command palette coming soon!', 'info');
      }
      return;
    }
    
    // Navigate to Sora (s key)
    if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping) {
      e.preventDefault();
      navigate('/sora');
      return;
    }
    
    // Show help (? key)
    if (e.key === '?' && !isTyping) {
      e.preventDefault();
      if (onHelp) {
        onHelp();
      } else {
        showToast(
          `Keyboard Shortcuts:
          / - Focus search
          g - Generate new content
          s - Go to Sora (video)
          Del - Delete selected items
          Shift+Del - Delete without confirmation
          Cmd/Ctrl+K - Command palette
          Esc - Close modals
          ? - Show this help`,
          'info',
          5000
        );
      }
      return;
    }
  }, [disabled, selectedIds, onDelete, onSearch, onGenerate, onCommandPalette, onHelp, navigate, showToast]);
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  return {
    handleKeyDown
  };
}