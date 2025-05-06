import { FileService, FileInfo, DirectoryItem } from '@/lib/file-service';

/**
 * Re-export imported types to ensure consistency across application
 */
export type { FileService, FileInfo, DirectoryItem };

/**
 * Interface for file-related state and operations
 */
export interface FileSlice {
  /**
   * State properties
   */
  fileService: FileService;
  currentFile: FileInfo | null;
  openFiles: FileInfo[];
  activeFilePath: string | null;
  
  /**
   * File action methods
   */
  setActiveFilePath: (path: string | null) => void;
  setCurrentFile: (file: FileInfo | null) => void;
  openFile: () => Promise<FileInfo | null>;
  openFileFromPath: (path: string) => Promise<FileInfo | null>;
  saveFile: (content: string) => Promise<FileInfo | null>;
  saveFileAs: (content: string) => Promise<FileInfo | null>;
  updateFileContent: (content: string) => void;
  closeFile: (filePath: string) => void;
  switchToFile: (filePath: string) => void;
}

/**
 * Interface for directory-related state and operations
 */
export interface DirectorySlice {
  /**
   * State properties
   */
  directoryStructure: DirectoryItem[] | undefined;
  currentDirectory: string | null;
  
  /**
   * Directory action methods
   */
  setCurrentDirectory: (path: string | null) => void;
  openDirectory: () => Promise<DirectoryItem[] | null>;
  loadDirectoryContents: (dirPath: string, item: DirectoryItem) => Promise<void>;
  searchFiles: (query: string) => Promise<DirectoryItem[]>;
  searchFileContents: (query: string) => Promise<DirectoryItem[]>;
  refreshDirectoryStructure: () => Promise<void>;
  setDirectoryStructure: (structure: DirectoryItem[] | undefined) => void;
}

/**
 * Interface for UI-related state and operations
 */
export interface UISlice {
  /**
   * State properties
   */
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
  
  /**
   * UI action methods
   */
  handleRename: (path: string) => Promise<void>;
  handleRenameSubmit: (newName: string) => Promise<void>;
  closeRenameDialog: () => void;
  handleCreateFile: (dirPath: string) => Promise<void>;
  handleCreateFolder: (dirPath: string) => Promise<void>;
  openCreateDialog: (path: string, type: 'file' | 'folder') => void;
  closeCreateDialog: () => void;
  handleCreateSubmit: (name: string) => Promise<void>;
}

/**
 * Interface for clipboard-related state and operations
 */
export interface ClipboardSlice {
  /**
   * State properties
   */
  clipboard: { 
    type: 'cut' | 'copy' | null;
    path: string | null;
  };
  
  /**
   * Clipboard action methods
   */
  handleCut: (path: string) => Promise<void>;
  handleCopy: (path: string) => Promise<void>;
  handlePaste: (targetPath: string) => Promise<void>;
  handleCopyPath: (path: string) => Promise<void>;
  handleCopyRelativePath: (path: string) => Promise<void>;
}

/**
 * Interface for utility operations
 */
export interface UtilitySlice {
  /**
   * Utility methods for file operations
   */
  isImageFile: (filePath: string) => boolean;
  isAudioFile: (filePath: string) => boolean;
  handleDelete: (path: string) => Promise<void>;
}

/**
 * Combined type for the entire file store
 */
export type FileStore = FileSlice & DirectorySlice & UISlice & ClipboardSlice & UtilitySlice;