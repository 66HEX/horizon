import { StateCreator } from 'zustand';
import { UISlice, FileSlice, DirectorySlice } from '@/lib/stores/file-store/types';
import { basename, dirname, join } from '@tauri-apps/api/path';
import * as nativeFs from '@/lib/native-fs';

/**
 * Creator function for the UI operations slice
 * @returns UI slice with state and actions for UI operations
 */
export const createUISlice: StateCreator<
  UISlice & FileSlice & DirectorySlice, 
  [],
  [],
  UISlice
> = (set, get) => ({
  /**
   * State properties
   */
  renameDialog: {
    isOpen: false,
    path: null,
    name: '',
    isDirectory: false
  },
  createDialog: {
    isOpen: false,
    path: null,
    type: 'file'
  },
  
  /**
   * Open the rename dialog for a path
   * @param path - Path of the item to rename
   * @returns Promise that resolves when dialog is prepared
   */
  handleRename: async (path) => {
    try {
      const name = await basename(path);
      const isDirectory = await nativeFs.isDirectory(path);
      set({
        renameDialog: {
          isOpen: true,
          path,
          name,
          isDirectory
        }
      });
    } catch (error) {
      console.error('Error preparing rename dialog:', error);
    }
  },
  
  /**
   * Close the rename dialog
   */
  closeRenameDialog: () => {
    set({
      renameDialog: {
        isOpen: false,
        path: null,
        name: '',
        isDirectory: false
      }
    });
  },
  
  /**
   * Handle the rename submission
   * @param newName - New name for the item
   * @returns Promise that resolves when rename operation completes
   */
  handleRenameSubmit: async (newName) => {
    try {
      const { renameDialog, fileService } = get();
      if (!renameDialog.path || !newName || newName === renameDialog.name) {
        get().closeRenameDialog();
        return;
      }
      
      const path = renameDialog.path;
      const dir = await dirname(path);
      const newPath = await join(dir, newName);
      const isDirectory = renameDialog.isDirectory;
      
      const targetExists = await nativeFs.pathExists(newPath);
      if (targetExists) {
        throw new Error(`A ${isDirectory ? 'folder' : 'file'} with the name "${newName}" already exists.`);
      }
      
      await nativeFs.renamePath(path, newPath);
      
      try {
        const parentContents = await fileService.loadDirectoryContents(dir);
        
        if (parentContents) {
          set((state) => {
            const updateDirectoryStructure = (
              items: DirectoryItem[] | undefined
            ): DirectoryItem[] | undefined => {
              if (!items) return undefined;

              return items.map((currentItem) => {
                if (currentItem.path === dir) {
                  return {
                    ...currentItem,
                    children: parentContents,
                    needsLoading: false
                  };
                }

                if (currentItem.children) {
                  return {
                    ...currentItem,
                    children: updateDirectoryStructure(currentItem.children)
                  };
                }

                return currentItem;
              });
            };

            return {
              directoryStructure: updateDirectoryStructure(state.directoryStructure)
            };
          });
        }
      } catch (error) {
        console.error('Error updating directory contents after rename:', error);
        await get().refreshDirectoryStructure();
      }
      
      const { openFiles, currentFile } = get();
      if (!isDirectory && openFiles.some(f => f.path === path)) {
        set((state) => {
          const newOpenFiles = state.openFiles.map(f => {
            if (f.path === path) {
              return {
                id: f.id,
                path: newPath,
                name: newName,
                content: f.content,
                isUnsaved: f.isUnsaved
              };
            }
            return { ...f };
          });
          
          const newCurrentFile = currentFile?.path === path 
            ? {
                id: currentFile.id,
                path: newPath,
                name: newName,
                content: currentFile.content,
                isUnsaved: currentFile.isUnsaved
              }
            : currentFile;
          
          return {
            openFiles: newOpenFiles,
            currentFile: newCurrentFile,
            activeFilePath: state.activeFilePath === path ? newPath : state.activeFilePath
          };
        });
      }
      
      get().closeRenameDialog();
    } catch (error: any) {
      console.error('Error renaming item:', error);
      window.alert(`Error renaming: ${error.message || 'Unknown error'}`);
      get().closeRenameDialog();
    }
  },

  /**
   * Open the create dialog
   * @param path - Directory path where to create the item
   * @param type - Type of item to create ('file' or 'folder')
   */
  openCreateDialog: (path, type) => {
    set({
      createDialog: {
        isOpen: true,
        path,
        type
      }
    });
  },
  
  /**
   * Close the create dialog
   */
  closeCreateDialog: () => {
    const currentType = get().createDialog.type;
    set({
      createDialog: {
        isOpen: false,
        path: null,
        type: currentType
      }
    });
  },
  
  /**
   * Handle the create submission
   * @param name - Name for the new item
   * @returns Promise that resolves when creation operation completes
   */
  handleCreateSubmit: async (name) => {
    try {
      const { createDialog, fileService } = get();
      if (!createDialog.path || !name) {
        get().closeCreateDialog();
        return;
      }
      
      const path = createDialog.path;
      const itemType = createDialog.type;
      console.log(`Attempting to create ${itemType} with name "${name}" in path "${path}"`);
      
      if (itemType === 'file') {
        const filePath = await join(path, name);
        
        const fileExists = await nativeFs.pathExists(filePath);
        if (fileExists) {
          throw new Error(`A file with the name "${name}" already exists.`);
        }
        
        await nativeFs.createFile(filePath, '');
        console.log(`Successfully created file: ${filePath}`);
        
        const parentContents = await fileService.loadDirectoryContents(path);
        if (parentContents) {
          set((state) => {
            const updateDirectoryStructure = (
              items: DirectoryItem[] | undefined
            ): DirectoryItem[] | undefined => {
              if (!items) return undefined;

              return items.map((currentItem) => {
                if (currentItem.path === path) {
                  return {
                    ...currentItem,
                    children: parentContents,
                    needsLoading: false
                  };
                }

                if (currentItem.children) {
                  return {
                    ...currentItem,
                    children: updateDirectoryStructure(currentItem.children)
                  };
                }

                return currentItem;
              });
            };

            return {
              directoryStructure: updateDirectoryStructure(state.directoryStructure)
            };
          });
        }
        
        await get().refreshDirectoryStructure();
        
        await get().openFileFromPath(filePath);
      } else if (itemType === 'folder') {
        const folderPath = await join(path, name);
        
        const folderExists = await nativeFs.pathExists(folderPath);
        if (folderExists) {
          throw new Error(`A folder with the name "${name}" already exists.`);
        }
        
        await nativeFs.createDirectory(folderPath);
        
        const parentContents = await fileService.loadDirectoryContents(path);
        if (parentContents) {
          set((state) => {
            const updateDirectoryStructure = (
              items: DirectoryItem[] | undefined
            ): DirectoryItem[] | undefined => {
              if (!items) return undefined;

              return items.map((currentItem) => {
                if (currentItem.path === path) {
                  const updatedContents = parentContents.map(child => {
                    if (child.path === folderPath && child.isDirectory) {
                      return {
                        ...child,
                        needsLoading: false,
                        children: []
                      };
                    }
                    
                    const existingChild = currentItem.children?.find(existingItem => existingItem.path === child.path);
                    if (existingChild && existingChild.children) {
                      return {
                        ...child,
                        children: existingChild.children,
                        needsLoading: existingChild.needsLoading
                      };
                    }
                    
                    return child;
                  });
                  
                  return {
                    ...currentItem,
                    children: updatedContents,
                    needsLoading: false
                  };
                }

                if (currentItem.children) {
                  return {
                    ...currentItem,
                    children: updateDirectoryStructure(currentItem.children)
                  };
                }

                return currentItem;
              });
            };

            return {
              directoryStructure: updateDirectoryStructure(state.directoryStructure)
            };
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await get().refreshDirectoryStructure();
      } else {
        throw new Error(`Unknown item type: ${itemType}`);
      }
      
      get().closeCreateDialog();
    } catch (error) {
      console.error('Error creating item:', error);
      window.alert(`Error creating ${get().createDialog.type}: ${error}`);
    }
  },
  
  /**
   * Open create file dialog for a directory
   * @param dirPath - Directory path where to create the file
   * @returns Promise that resolves when dialog opens
   */
  handleCreateFile: async (dirPath) => {
    get().openCreateDialog(dirPath, 'file');
  },

  /**
   * Open create folder dialog for a directory
   * @param dirPath - Directory path where to create the folder
   * @returns Promise that resolves when dialog opens
   */
  handleCreateFolder: async (dirPath) => {
    console.log(`handleCreateFolder called for path: ${dirPath}`);
    get().openCreateDialog(dirPath, 'folder');
  }
});

/**
 * Import for type checking to avoid compiler errors
 */
import { DirectoryItem } from '@/lib/stores/file-store/types';