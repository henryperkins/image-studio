import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { LayoutGrid, List, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LibraryType, LibrarySort, LibraryView } from '@/contexts/LibraryContext';

interface LibraryControlsProps {
  // Filter state
  searchQuery: string;
  libraryType: LibraryType;
  librarySort: LibrarySort;
  viewMode: LibraryView;
  
  // Counts
  totalCount: number;
  filteredCount: number;
  
  // Actions
  onSearchChange: (query: string) => void;
  onTypeChange: (type: LibraryType) => void;
  onSortChange: (sort: LibrarySort) => void;
  onViewModeChange: (mode: LibraryView) => void;
  
  // Optional
  className?: string;
}

export default function LibraryControls({
  searchQuery,
  libraryType,
  librarySort,
  viewMode,
  totalCount,
  filteredCount,
  onSearchChange,
  onTypeChange,
  onSortChange,
  onViewModeChange,
  className
}: LibraryControlsProps) {
  const showingCount = filteredCount < totalCount;
  
  return (
    <div className={cn('space-y-2', className)}>
      {/* First row: Type filter and View toggle */}
      <div className="flex gap-2 items-center">
        {/* Type filter */}
        <div className="inline-flex rounded-md overflow-hidden border border-input bg-background/60 supports-[backdrop-filter]:bg-background/40 backdrop-blur">
          <Button 
            size="sm" 
            variant={libraryType === 'all' ? 'default' : 'outline'} 
            onClick={() => onTypeChange('all')}
            aria-pressed={libraryType === 'all'}
          >
            All
          </Button>
          <Button 
            size="sm" 
            variant={libraryType === 'images' ? 'default' : 'outline'} 
            onClick={() => onTypeChange('images')}
            aria-pressed={libraryType === 'images'}
          >
            Images
          </Button>
          <Button 
            size="sm" 
            variant={libraryType === 'videos' ? 'default' : 'outline'} 
            onClick={() => onTypeChange('videos')}
            aria-pressed={libraryType === 'videos'}
          >
            Videos
          </Button>
        </div>
        
        <div className="flex-1" />
        
        {/* View mode toggle */}
        <div 
          className="inline-flex rounded-md overflow-hidden border border-input bg-background/60 supports-[backdrop-filter]:bg-background/40 backdrop-blur"
          role="group"
          aria-label="View mode"
        >
          <Button 
            size="sm" 
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            onClick={() => onViewModeChange('grid')}
            aria-pressed={viewMode === 'grid'}
            title="Grid view"
            className="gap-1"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Grid</span>
          </Button>
          <Button 
            size="sm" 
            variant={viewMode === 'list' ? 'default' : 'outline'}
            onClick={() => onViewModeChange('list')}
            aria-pressed={viewMode === 'list'}
            title="List view"
            className="gap-1"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">List</span>
          </Button>
        </div>
      </div>
      
      {/* Second row: Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        {/* Search input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input 
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by prompt or filename…"
            aria-label="Search media library"
            id="library-search"
            className="w-full pl-9 bg-background/60 supports-[backdrop-filter]:bg-background/40 backdrop-blur"
          />
        </div>
        
        {/* Sort dropdown */}
        <div className="sm:w-[200px] w-full">
          <Select value={librarySort} onValueChange={(v) => onSortChange(v as LibrarySort)}>
            <SelectTrigger aria-label="Sort library">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="name-desc">Name Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Optional: Results count */}
      {showingCount && (
        <div className="text-xs text-muted-foreground">
          Showing {filteredCount} of {totalCount} items
        </div>
      )}
    </div>
  );
}