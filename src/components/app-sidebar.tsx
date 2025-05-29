import { useState, useEffect, useMemo } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useFileContext } from "@/lib/file-context"
import { RenameDialog } from "@/components/rename-dialog"
import { CreateDialog } from "@/components/create-dialog"
import { useLspStore } from "@/lib/stores/lsp-store"
import { SidebarTabs } from "@/components/sidebar-tabs"
import { SidebarFilesTab } from "@/components/sidebar-files-tab"
import { SidebarSearchTab } from "@/components/sidebar-search-tab"
import { SidebarDiagnosticsTab } from "@/components/sidebar-diagnostics-tab"
import { SidebarGitTab } from "@/components/sidebar-git-tab"

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
  
  const { diagnostics, currentFilePath, filesDiagnostics } = useLspStore();
  const [activeTab, setActiveTab] = useState<string>("files");

  const diagnosticSummary = useMemo(() => {
    // Count all errors, warnings and infos across all files
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    Object.values(filesDiagnostics).forEach((fileDiagnostics) => {
      errorCount += fileDiagnostics.filter(d => d.severity === 'error').length;
      warningCount += fileDiagnostics.filter(d => d.severity === 'warning').length;
      infoCount += fileDiagnostics.filter(d => d.severity === 'information' || d.severity === 'hint').length;
    });
    
    return {
      errorCount,
      warningCount,
      infoCount,
      total: errorCount + warningCount + infoCount
    };
  }, [filesDiagnostics]);

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
      // Close search mode when switching to a different tab
      const event = new CustomEvent('close-search', {});
      window.dispatchEvent(event);
    }
  }, [activeTab]);

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
      console.error('Error opening file:', error);
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

      <SidebarContent className="relative w-full h-full select-none">
        <div className="flex h-full">
          {/* Sidebar Navigation */}
          <SidebarTabs 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            diagnosticSummary={diagnosticSummary}
          />

          {/* Tab Content */}
          <div className="flex-1 flex flex-col overflow-x-hidden">
            <div className="flex flex-col w-full bg-gradient-to-r from-sidebar-background to-sidebar-background/95 backdrop-blur-sm">
              {activeTab === "files" && (
                <SidebarFilesTab 
                  handleOpenFile={handleOpenFile}
                  handleOpenDirectory={handleOpenDirectory}
                  handleSaveFile={handleSaveFile}
                  handleSaveAsFile={handleSaveAsFile}
                  currentDirectory={currentDirectory}
                  directoryStructure={directoryStructure || null}
                  onFileClick={handleFileClick}
                  activeFilePath={activeFilePath}
                  currentFile={currentFile}
                />
              )}

              {activeTab === "search" && (
                <SidebarSearchTab
                  searchFiles={searchFiles}
                  searchFileContents={searchFileContents}
                  activeFilePath={activeFilePath}
                  onFileClick={handleFileClick}
                />
              )}

              {activeTab === "diagnostics" && (
                <SidebarDiagnosticsTab
                  filesDiagnostics={filesDiagnostics}
                  openFileFromPath={(path: string) => {
                    return openFileFromPath(path).then(() => {});
                  }}
                  diagnosticSummary={diagnosticSummary}
                  currentFilePath={currentFilePath}
                />
              )}

              {activeTab === "git" && (
                <SidebarGitTab />
              )}
            </div>
          </div>
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}