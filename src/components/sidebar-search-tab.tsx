import React from "react";
import { useState, useRef, useEffect } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { SidebarGroupLabel, SidebarGroupContent, SidebarMenu } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DirectoryItem } from "@/lib/file-service";
import { DirectoryTree } from "@/components/directory-tree";

interface SidebarSearchTabProps {
  searchFiles: (query: string) => Promise<DirectoryItem[]>;
  searchFileContents: (query: string) => Promise<DirectoryItem[]>;
  activeFilePath: string | null;
  onFileClick: (path: string) => Promise<void>;
}

export function SidebarSearchTab({
  searchFiles,
  searchFileContents,
  activeFilePath,
  onFileClick
}: SidebarSearchTabProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<DirectoryItem[]>([]);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchingIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearchMode(false);
      return;
    }

    setIsSearchMode(true);

    searchDebounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);
  };

  const performSearch = async (query: string) => {
    if (!query.trim()) return;

    if (searchingIndicatorTimeoutRef.current) {
      clearTimeout(searchingIndicatorTimeoutRef.current);
    }

    searchingIndicatorTimeoutRef.current = setTimeout(() => {
      setIsSearching(true);
    }, 300);

    try {
      const fileNameResults = await searchFiles(query);
      const contentResults = await searchFileContents(query);

      const combinedResults = [...fileNameResults];

      contentResults.forEach(contentItem => {
        if (!combinedResults.some(item => item.path === contentItem.path)) {
          combinedResults.push({
            ...contentItem,
            name: `${contentItem.name} (match in content)`
          });
        }
      });

      setSearchResults(combinedResults);
    } catch (error) {
      console.error('Error during search:', error);
    } finally {
      if (searchingIndicatorTimeoutRef.current) {
        clearTimeout(searchingIndicatorTimeoutRef.current);
        searchingIndicatorTimeoutRef.current = null;
      }
      setIsSearching(false);
    }
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      if (searchingIndicatorTimeoutRef.current) {
        clearTimeout(searchingIndicatorTimeoutRef.current);
      }
    };
  }, []);

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchMode(false);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (searchingIndicatorTimeoutRef.current) {
      clearTimeout(searchingIndicatorTimeoutRef.current);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 w-full">
        <div className="flex w-full justify-between items-center gap-2">
          <SidebarGroupLabel className="mb-0">
            {isSearchMode ? `Results (${searchResults.length})` : 'Search'}
          </SidebarGroupLabel>
        </div>
      </div>

      <SidebarGroupContent className="relative overflow-hidden h-full">
        <div className="px-1 pb-2 pt-2">
          <div className="relative mx-2">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <IconSearch className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              className="pl-8 pr-8 text-xs bg-sidebar-accent/10 border-sidebar-border/20 focus:border-sidebar-border/40"
              placeholder="Search files and content..."
              value={searchQuery}
              onChange={handleSearchInputChange}
            />
            {searchQuery && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  className="flex items-center justify-center hover:text-foreground transition-colors"
                  onClick={clearSearch}
                >
                  <IconX className="h-4 w-4 text-muted-foreground cursor-pointer" />
                </button>
              </div>
            )}
          </div>
        </div>
        <ScrollArea className="absolute inset-0 w-full h-full" type="auto" scrollHideDelay={400}>
          <SidebarMenu>
            {isSearching ? (
              <div className="px-2 py-4 text-center text-muted-foreground">
                <p className="text-sm">Searching...</p>
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((item, index) => (
                <DirectoryTree
                  key={`search-${index}`}
                  item={item}
                  onFileClick={onFileClick}
                  activeFilePath={activeFilePath}
                />
              ))
            ) : searchQuery ? (
              <div className="px-2 py-4 text-center text-muted-foreground">
                <p className="text-sm">No results for "{searchQuery}"</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
                <p className="text-xs mt-2">Enter a search term to find files and content</p>
              </div>
            )}
          </SidebarMenu>
        </ScrollArea>
      </SidebarGroupContent>
    </>
  );
} 