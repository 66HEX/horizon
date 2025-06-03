import { StateCreator } from 'zustand';
import { FileInfo, FileSlice, DirectorySlice, UISlice } from '@/lib/stores/file-store/types';
import { FileService as FileServiceClass } from '@/lib/file-service';

/**
 * Creator function for the file operations slice
 * @returns File slice with state and actions for file operations
 */
export const createFileSlice: StateCreator<
  FileSlice & DirectorySlice & UISlice,
  [],
  [],
  FileSlice
> = (set, get) => {
  const fileService = new FileServiceClass();

  /**
   * Update the current file in the store
   * @param file - File information to update
   */
  const updateCurrentFile = (file: FileInfo) => {
    const { openFiles } = get();
    const existingFileIndex = openFiles.findIndex(f => f.path === file.path);
    
    const fileDeepCopy: FileInfo = {
      id: file.id,
      path: file.path,
      name: file.name,
      content: file.content,
      isUnsaved: file.isUnsaved || false
    };
    
    if (existingFileIndex === -1) {
      if (openFiles.length >= 3) {
        const newestFile = openFiles[openFiles.length - 1];
        get().closeFile(newestFile.path);
      }
      set((state) => ({
        openFiles: [...state.openFiles, fileDeepCopy],
        currentFile: fileDeepCopy,
        activeFilePath: fileDeepCopy.path
      }));
    } else {
      set((state) => {
        const newFiles = [...state.openFiles];
        newFiles[existingFileIndex] = fileDeepCopy;
        return {
          openFiles: newFiles,
          currentFile: fileDeepCopy,
          activeFilePath: fileDeepCopy.path
        };
      });
    }
  };

  return {
    /**
     * State properties
     */
    fileService,
    currentFile: null,
    openFiles: [],
    activeFilePath: null,

    /**
     * Set the active file path
     * @param path - Path to set as active or null
     */
    setActiveFilePath: (path) => set({ activeFilePath: path }),
    
    /**
     * Set the current file
     * @param file - File to set as current or null
     */
    setCurrentFile: (file) => set({ currentFile: file }),

    /**
     * Open a file using file picker dialog
     * @returns Promise that resolves to opened file or null
     */
    openFile: async () => {
      try {
        const file = await fileService.openFile();
        if (file) {
          updateCurrentFile(file);
        }
        return file;
      } catch (error) {
        console.error('Error in openFile:', error);
        return null;
      }
    },

    /**
     * Open a file from a specific path
     * @param path - Path of the file to open
     * @returns Promise that resolves to opened file or null
     */
    openFileFromPath: async (path) => {
      try {
        const file = await fileService.openFileFromPath(path);
        if (file) {
          updateCurrentFile(file);
        }
        return file;
      } catch (error) {
        console.error('Error in openFileFromPath:', error);
        return null;
      }
    },

    /**
     * Save the current file with new content
     * @param content - Content to save to the file
     * @returns Promise that resolves to saved file or null
     */
    saveFile: async (content) => {
      try {
        const { currentFile } = get();
        if (!currentFile) {
          return null;
        }
        
        const editorContainer = document.querySelector('[data-editor-container]') as any;
        if (editorContainer && editorContainer.__currentContent) {
          content = editorContainer.__currentContent;
          console.log("Using content from __currentContent, length:", content.length);
        } 
        else if (content.trim().length === 0) {
          console.warn('Warning: Attempting to save empty content');
          
          if (currentFile.content && currentFile.content.length > 0) {
            content = currentFile.content;
            console.log("Using content from currentFile, length:", content.length);
          }
          else if (editorContainer) {
            const editorContent = editorContainer.querySelector('.cm-content')?.textContent;
            if (editorContent && editorContent.length > 0) {
              content = editorContent;
              console.log("Using content from .cm-content, length:", content.length);
            }
          }
        }
        
        const file = await fileService.saveFile(content, false);
        
        if (file) {
          set((state) => {
            const updatedOpenFiles = state.openFiles.map(f =>
              f.path === file.path ? {
                ...f,
                content: content,
                isUnsaved: false
              } : f
            );
            
            return {
              openFiles: updatedOpenFiles,
              currentFile: {
                ...file,
                content: content
              }
            };
          });
        }
        
        return file;
      } catch (error) {
        console.error('Error in saveFile:', error);
        return null;
      }
    },

    /**
     * Save the current file with new content using "Save As" dialog
     * @param content - Content to save to the file
     * @returns Promise that resolves to saved file or null
     */
    saveFileAs: async (content) => {
      try {
        const file = await fileService.saveFile(content, true);
        if (file) {
          set({ currentFile: file });
        }
        return file;
      } catch (error) {
        console.error('Error in saveFileAs:', error);
        return null;
      }
    },

    /**
     * Update the content of the current file
     * @param content - New content for the file
     */
    updateFileContent: (content) => {
      const { currentFile } = get();
      if (!currentFile) return;

      const updatedFile: FileInfo = {
        id: currentFile.id,
        path: currentFile.path,
        name: currentFile.name,
        content: content,
        isUnsaved: true
      };

      set((state) => {
        const fileIndex = state.openFiles.findIndex(f => f.path === currentFile.path);
        
        if (fileIndex !== -1) {
          const newOpenFiles = [...state.openFiles];
          newOpenFiles[fileIndex] = updatedFile;
          
          return {
            openFiles: newOpenFiles,
            currentFile: updatedFile
          };
        } else {
          return {
            openFiles: [...state.openFiles, updatedFile],
            currentFile: updatedFile
          };
        }
      });
      
      const editorContainer = document.querySelector('[data-editor-container]');
      if (editorContainer) {
        (editorContainer as any).__currentContent = content;
      }
    },

    /**
     * Close a file by its path
     * @param filePath - Path of the file to close
     */
    closeFile: (filePath) => {
      set((state) => {
        const newOpenFiles = state.openFiles
          .filter(file => file.path !== filePath)
          .map(file => ({ ...file }));
        
        let newCurrentFile = state.currentFile;
        let newActiveFilePath = state.activeFilePath;
        
        if (state.activeFilePath === filePath) {
          if (newOpenFiles.length > 0) {
            const lastFile = newOpenFiles[newOpenFiles.length - 1];
            newCurrentFile = { ...lastFile };
            newActiveFilePath = lastFile.path;
          } else {
            newCurrentFile = null;
            newActiveFilePath = null;
          }
        } else if (state.currentFile?.path === filePath) {
          const activeFile = newOpenFiles.find(f => f.path === state.activeFilePath);
          if (activeFile) {
            newCurrentFile = { ...activeFile };
          } else {
            newCurrentFile = null;
          }
        }

        return {
          openFiles: newOpenFiles,
          currentFile: newCurrentFile,
          activeFilePath: newActiveFilePath
        };
      });
    },

    /**
     * Switch to a file by its path
     * @param filePath - Path of the file to switch to
     */
    switchToFile: (filePath) => {
      set((state) => {
        const file = state.openFiles.find(f => f.path === filePath);
        if (file) {
          const fileDeepCopy = { ...file };
          return {
            currentFile: fileDeepCopy,
            activeFilePath: filePath
          };
        }
        return state;
      });
    }
  };
};