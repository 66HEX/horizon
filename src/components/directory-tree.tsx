import * as React from "react"
import { useState, useEffect } from "react"
import { IconChevronRight, IconFile, IconFolderPlus, IconCopy, IconTrash, IconEdit, IconScissors, IconClipboard, IconFileText } from "@tabler/icons-react"
import { DirectoryItem, FileService } from "@/lib/file-service"
import { useFileContext } from "@/lib/file-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"

export function DirectoryTree({ item, onFileClick, activeFilePath }: {
  item: DirectoryItem,
  onFileClick: (path: string) => void,
  activeFilePath: string | null
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [localChildren, setLocalChildren] = useState<DirectoryItem[] | null>(null);
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  
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

  
  useEffect(() => {
    if (item.isDirectory && isExpanded && (item.needsLoading || !item.children || item.children.length === 0)) {
      
      setIsLocalLoading(true);
      setLocalChildren(null);
      
      
      const loadContents = async () => {
        try {
          loadDirectoryContents(item.path, item);
          
          
          const fileService = new FileService();
          const contents = await fileService.loadDirectoryContents(item.path);
          if (contents && contents.length > 0) {
            setLocalChildren(contents);
          } else {
            
            setLocalChildren([]);
          }
          
          setIsLocalLoading(false);
        } catch (error) {
          console.error('Error loading contents:', error);
          setIsLocalLoading(false);
          
          setLocalChildren([]);
        }
      };
      
      loadContents();
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
  
  
  const isLoading = localChildren === null ? isLocalLoading : false;
    
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