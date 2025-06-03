import { IconFile, IconFolderOpen, IconDeviceFloppy, IconDownload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { SidebarGroupLabel, SidebarGroupContent, SidebarMenu } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DirectoryItem } from "@/lib/file-service";
import { DirectoryTree } from "@/components/directory-tree";

interface SidebarFilesTabProps {
  handleOpenFile: () => Promise<void>;
  handleOpenDirectory: () => Promise<void>;
  handleSaveFile: () => Promise<void>;
  handleSaveAsFile: () => Promise<void>;
  currentDirectory: string | null;
  directoryStructure: DirectoryItem[] | null;
  onFileClick: (path: string) => Promise<void>;
  activeFilePath: string | null;
  currentFile: { path: string; content: string } | null;
}

export function SidebarFilesTab({
  handleOpenFile,
  handleOpenDirectory,
  handleSaveFile,
  handleSaveAsFile,
  currentDirectory,
  directoryStructure,
  onFileClick,
  activeFilePath,
  currentFile
}: SidebarFilesTabProps) {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 w-full">
        <div className="flex w-full justify-between items-center gap-2">
          <SidebarGroupLabel className="mb-0">
            {currentDirectory 
              ? `Files (${currentDirectory.split('/').pop() || currentDirectory.split('\\').pop()})` 
              : 'Files'}
          </SidebarGroupLabel>
          <div className="flex items-center gap-1">
          <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleOpenFile}
                    className="h-6 w-6 hover:bg-sidebar-accent/20 disabled:hover:scale-100"
                  >
                    <IconFile className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Open File
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleOpenDirectory}
                    className="h-6 w-6 hover:bg-sidebar-accent/20 disabled:hover:scale-100"
                  >
                    <IconFolderOpen className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Open Directory
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
                  {currentFile ? "Save As" : "No file open to save"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <SidebarGroupContent className="relative overflow-hidden h-full">
        <ScrollArea className="absolute inset-0 w-full h-full" type="auto" scrollHideDelay={400}>
          <SidebarMenu className="max-h-[100vh]">
            {directoryStructure ? (
              directoryStructure.map((item, index) => (
                <DirectoryTree
                  key={`file-${index}`}
                  item={item}
                  onFileClick={onFileClick}
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
    </>
  );
} 