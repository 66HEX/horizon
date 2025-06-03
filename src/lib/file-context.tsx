import React, { createContext, useContext, ReactNode } from 'react';
import { useFileStore } from '@/lib/stores/file-store';
import { FileInfo, DirectoryItem } from '@/lib/file-service';

interface FileContextType {
  currentFile: FileInfo | null;
  openFiles: FileInfo[];
  directoryStructure: DirectoryItem[] | undefined;
  currentDirectory: string | null;
  activeFilePath: string | null;
  clipboard: { type: 'cut' | 'copy' | null, path: string | null };
  renameDialog: {
    isOpen: boolean;
    path: string | null;
    name: string;
    isDirectory: boolean;
  };
  createDialog: {
    isOpen: boolean;
    path: string | null;
    type: 'file' | 'folder';
  };
  setActiveFilePath: (path: string | null) => void;
  setCurrentFile: (file: FileInfo | null) => void;
  setCurrentDirectory: (path: string | null) => void;
  openFile: () => Promise<FileInfo | null>;
  openFileFromPath: (path: string) => Promise<FileInfo | null>;
  openDirectory: () => Promise<DirectoryItem[] | null>;
  saveFile: (content: string) => Promise<FileInfo | null>;
  saveFileAs: (content: string) => Promise<FileInfo | null>;
  updateFileContent: (content: string) => void;
  searchFiles: (query: string) => Promise<DirectoryItem[]>;
  searchFileContents: (query: string) => Promise<DirectoryItem[]>;
  isImageFile: (filePath: string) => boolean;
  isAudioFile: (filePath: string) => boolean;
  loadDirectoryContents: (dirPath: string, item: DirectoryItem) => Promise<void>;
  closeFile: (filePath: string) => void;
  switchToFile: (filePath: string) => void;
  handleCut: (path: string) => Promise<void>;
  handleCopy: (path: string) => Promise<void>;
  handlePaste: (targetPath: string) => Promise<void>;
  handleRename: (path: string) => Promise<void>;
  handleRenameSubmit: (newName: string) => Promise<void>;
  closeRenameDialog: () => void;
  handleDelete: (path: string) => Promise<void>;
  handleCopyPath: (path: string) => Promise<void>;
  handleCopyRelativePath: (path: string) => Promise<void>;
  handleCreateFile: (path: string) => Promise<void>;
  handleCreateFolder: (path: string) => Promise<void>;
  openCreateDialog: (path: string, type: 'file' | 'folder') => void;
  closeCreateDialog: () => void;
  handleCreateSubmit: (name: string) => Promise<void>;
  setDirectoryStructure: (structure: DirectoryItem[] | undefined) => void;
  refreshDirectoryStructure: () => Promise<void>;
}

const FileContext = createContext<FileContextType | null>(null);

export const useFileContext = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileProvider');
  }
  return context;
};

interface FileProviderProps {
  children: ReactNode;
}

export const FileContextProvider: React.FC<FileProviderProps> = ({ children }) => {
  const fileStore = useFileStore();

  return (
    <FileContext.Provider value={fileStore}>
      {children}
    </FileContext.Provider>
  );
}; 