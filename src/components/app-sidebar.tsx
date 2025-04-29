import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { IconChevronRight, IconFile, IconFolderOpen, IconDeviceFloppy, IconDownload, IconSearch, IconX, IconGitBranch, IconFolder, IconFileText, IconFolderPlus, IconCopy, IconTrash, IconEdit, IconScissors, IconClipboard } from "@tabler/icons-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DirectoryItem } from "@/lib/file-service"
import { useFileContext } from "@/lib/file-context"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "./ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { RenameDialog } from "./rename-dialog"
import { CreateDialog } from "./create-dialog"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { toggleSidebar } = useSidebar();
  const { 
    openFile, 
    openDirectory, 
    openFileFromPath, 
    saveFile, 
    saveFileAs, 
    directoryStructure, 
    currentDirectory,
    activeFilePath,
    searchFiles,
    searchFileContents,
    currentFile,
    renameDialog,
    handleRenameSubmit,
    closeRenameDialog,
    createDialog,
    handleCreateSubmit,
    closeCreateDialog
  } = useFileContext();
  
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<DirectoryItem[]>([]);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchingIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<string>("files");

  useEffect(() => {
    const handleToggleSidebar = () => {
      toggleSidebar();
    };

    document.addEventListener('toggle-sidebar', handleToggleSidebar);
    return () => {
      document.removeEventListener('toggle-sidebar', handleToggleSidebar);
    };
  }, [toggleSidebar]);

  useEffect(() => {
    if (activeTab !== "search") {
      setIsSearchMode(false);
    }
  }, [activeTab]);

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

  const handleOpenFile = async () => {
    await openFile();
  };

  const handleOpenDirectory = async () => {
    await openDirectory();
  };

  const handleSaveFile = async () => {
    if (currentFile) {
      await saveFile(currentFile.content);
    }
  };

  const handleSaveAsFile = async () => {
    if (currentFile) {
      await saveFileAs(currentFile.content);
    }
  };

  const handleFileClick = async (filePath: string) => {
    try {
      await openFileFromPath(filePath);
    } catch (error) {
    }
  };

  return (
    <Sidebar {...props}>
      {renameDialog.isOpen && (
        <RenameDialog
          isOpen={renameDialog.isOpen}
          onClose={closeRenameDialog}
          onRename={handleRenameSubmit}
          itemName={renameDialog.name}
          itemType={renameDialog.isDirectory ? 'folder' : 'file'}
        />
      )}
      
      {createDialog.isOpen && (
        <CreateDialog
          isOpen={createDialog.isOpen}
          onClose={closeCreateDialog}
          onCreate={handleCreateSubmit}
          itemType={createDialog.type}
          directoryPath={createDialog.path || ''}
        />
      )}
      
      <SidebarContent className="relative w-full h-full bg-sidebar-background select-none">
        <div className="flex h-full">
          <div className="w-12 bg-sidebar-accent/5 border-r border-sidebar-border/20 flex flex-col items-center py-2">
            <button
              onClick={() => setActiveTab("files")}
              className={`p-2 rounded-md mb-2 cursor-pointer ${activeTab === "files" ? "bg-sidebar-accent/20" : "hover:bg-sidebar-accent/10"}`}
            >
              <IconFolder className="h-4 w-4" />
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`p-2 rounded-md mb-2 cursor-pointer ${activeTab === "search" ? "bg-sidebar-accent/20" : "hover:bg-sidebar-accent/10"}`}
            >
              <IconSearch className="h-4 w-4" />
            </button>
            <button
              onClick={() => setActiveTab("git")}
              className={`p-2 rounded-md cursor-pointer ${activeTab === "git" ? "bg-sidebar-accent/20" : "hover:bg-sidebar-accent/10"}`}
            >
              <IconGitBranch className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex flex-col w-full bg-gradient-to-r from-sidebar-background to-sidebar-background/95 backdrop-blur-sm border-b border-sidebar-border/20">
              <div className="flex items-center justify-between px-3 py-2 w-full">
                <div className="flex w-full justify-between items-center gap-2">
                  <SidebarGroupLabel className="mb-0">
                    {activeTab === "search" 
                      ? `Search` 
                      : (activeTab === "git"
                          ? `Git Integration`
                          : (isSearchMode 
                              ? `Results (${searchResults.length})` 
                              : (currentDirectory ? `Files (${currentDirectory.split('/').pop() || currentDirectory.split('\\').pop()})` : 'Files')))}
                  </SidebarGroupLabel>
                  <div className="flex items-center gap-1">
                    {activeTab === "files" && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={handleOpenFile}
                          title="Open File"
                          className="h-6 w-6 hover:bg-sidebar-accent/20"
                        >
                          <IconFile className="size-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={handleOpenDirectory}
                          title="Open Directory"
                          className="h-6 w-6 hover:bg-sidebar-accent/20"
                        >
                          <IconFolderOpen className="size-3" />
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={handleSaveFile}
                                disabled={!currentFile}
                                className="h-6 w-6 hover:bg-sidebar-accent/20 disabled:hover:scale-100"
                              >
                                <IconDeviceFloppy className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {currentFile ? "Save" : "No file open to save"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={handleSaveAsFile}
                                disabled={!currentFile}
                                className="h-6 w-6 hover:bg-sidebar-accent/20 disabled:hover:scale-100"
                              >
                                <IconDownload className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {currentFile ? "Save" : "No file open to save"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {activeTab === "files" && (
                <SidebarGroupContent className="relative overflow-hidden h-full">
                  <ScrollArea className="absolute inset-0 w-full h-full" type="auto" scrollHideDelay={400}>
                    <SidebarMenu>
                      {directoryStructure ? (
                        directoryStructure.map((item, index) => (
                          <DirectoryTree 
                            key={`file-${index}`} 
                            item={item} 
                            onFileClick={handleFileClick}
                            activeFilePath={activeFilePath} 
                          />
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
                          <p className="text-xs mt-2">Open a directory to view files</p>
                        </div>
                      )}
                    </SidebarMenu>
                  </ScrollArea>
                </SidebarGroupContent>
              )}

              {activeTab === "search" && (
                <SidebarGroupContent className="relative overflow-hidden h-full">
                  <div className="px-1 pb-2 pt-2">
                    <div className="relative ml-2">
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
                            onFileClick={handleFileClick}
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
              )}

              {activeTab === "git" && (
                <SidebarGroupContent className="relative overflow-hidden h-full">
                  <ScrollArea className="absolute inset-0 w-full h-full" type="auto" scrollHideDelay={400}>
                    <div className="mt-2 flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
                      <p className="mb-2">Git integration coming soon</p>
                      <p className="text-xs">This feature will allow you to manage your git repository</p>
                    </div>
                  </ScrollArea>
                </SidebarGroupContent>
              )}
            </div>
          </div>
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

function DirectoryTree({ item, onFileClick, activeFilePath }: { 
  item: DirectoryItem, 
  onFileClick: (path: string) => void,
  activeFilePath: string | null
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const { 
    loadDirectoryContents,
    handleCut,
    handleCopy,
    handlePaste,
    handleCopyPath,
    handleCopyRelativePath,
    handleRename,
    handleDelete,
    handleCreateFile,
    handleCreateFolder,
    clipboard
  } = useFileContext();
  
  const hasClipboardContent = clipboard.path !== null && clipboard.type !== null;
  
  // Effect to load contents when expanded
  useEffect(() => {
    if (item.isDirectory && isExpanded && (item.needsLoading || !item.children || item.children.length === 0)) {
      loadDirectoryContents(item.path, item);
    }
  }, [isExpanded, item, loadDirectoryContents]);
  
  const handleClick = () => {
    if (item.isDirectory) {
      setIsExpanded(!isExpanded);
    } else {
      onFileClick(item.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  };
  
  const isActive = activeFilePath === item.path;
  
  const handlePasteInFolder = async () => {
    try {
      if (item.isDirectory) {
        handlePaste(item.path);
      } else {
        const { dirname } = await import('@tauri-apps/api/path');
        const parentDir = await dirname(item.path);
        handlePaste(parentDir);
      }
    } catch (error) {
      console.error('Error during paste operation:', error);
    }
    setContextMenuPosition(null);
  };
  
  // Determine loading state
  const isLoading = item.isDirectory && isExpanded && item.needsLoading;
  
  return (
    <div className="pl-1 max-w-[16rem]">
      <DropdownMenu 
        open={!!contextMenuPosition} 
        onOpenChange={(open) => {
          if (!open) setContextMenuPosition(null);
        }}
      >
        <div 
          className={`flex flex-row items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted ${isActive ? 'bg-muted' : ''}`}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        >
          {item.isDirectory ? (
            <IconChevronRight 
              className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          ) : (
            <IconFile className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="truncate text-sm">{item.name}</span>
        </div>
        
        {contextMenuPosition && (
          <DropdownMenuContent 
            className="w-56" 
            style={{
              position: 'absolute',
              left: `${contextMenuPosition.x}px`,
              top: `${contextMenuPosition.y}px`
            }}
          >
            {item.isDirectory && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => {
                    handleCreateFile(item.path);
                    setContextMenuPosition(null);
                  }}>
                    <IconFileText className="mr-2 h-4 w-4" />
                    <span>New File</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => {
                    handleCreateFolder(item.path);
                    setContextMenuPosition(null);
                  }}>
                    <IconFolderPlus className="mr-2 h-4 w-4" />
                    <span>New Folder</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => {
                handleCut(item.path);
                setContextMenuPosition(null);
              }}>
                <IconScissors className="mr-2 h-4 w-4" />
                <span>Cut</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {
                handleCopy(item.path);
                setContextMenuPosition(null);
              }}>
                <IconCopy className="mr-2 h-4 w-4" />
                <span>Copy</span>
              </DropdownMenuItem>
              {hasClipboardContent && (
                <DropdownMenuItem onSelect={handlePasteInFolder}>
                  <IconClipboard className="mr-2 h-4 w-4" />
                  <span>Paste {!item.isDirectory && "in Parent Folder"}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => {
                handleCopyPath(item.path);
                setContextMenuPosition(null);
              }}>
                <IconCopy className="mr-2 h-4 w-4" />
                <span>Copy Path</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {
                handleCopyRelativePath(item.path);
                setContextMenuPosition(null);
              }}>
                <IconCopy className="mr-2 h-4 w-4" />
                <span>Copy Relative Path</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => {
                handleRename(item.path);
                setContextMenuPosition(null);
              }}>
                <IconEdit className="mr-2 h-4 w-4" />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  handleDelete(item.path);
                  setContextMenuPosition(null);
                }}
              >
                <IconTrash className="mr-2 h-4 w-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
      
      {item.isDirectory && isExpanded && (
        <div className="pl-3">
          {isLoading ? (
            <div className="flex items-center gap-2 py-1 px-2 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : item.children && item.children.length > 0 ? (
            item.children.map((child) => (
              <DirectoryTree 
                key={child.path} 
                item={child} 
                onFileClick={onFileClick}
                activeFilePath={activeFilePath}
              />
            ))
          ) : (
            <div className="flex items-center gap-2 py-1 px-2 text-sm text-muted-foreground">
              Empty directory
            </div>
          )}
        </div>
      )}
    </div>
  );
}
