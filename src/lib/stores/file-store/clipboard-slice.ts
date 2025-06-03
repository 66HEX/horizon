import { StateCreator } from 'zustand';
import { ClipboardSlice, FileSlice, DirectorySlice } from '@/lib/stores/file-store/types';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { basename, dirname, join } from '@tauri-apps/api/path';
import * as nativeFs from '@/lib/native-fs';

/**
 * Creator function for the clipboard operations slice
 * @returns Clipboard slice with state and actions for clipboard operations
 */
export const createClipboardSlice: StateCreator<
  ClipboardSlice & FileSlice & DirectorySlice,
  [],
  [],
  ClipboardSlice
> = (set, get) => ({
  /**
   * State properties
   */
  clipboard: { type: null, path: null },
  
  /**
   * Mark a file or directory for cut operation
   * @param path - Path of the item to cut
   * @returns Promise that resolves when operation completes
   */
  handleCut: async (path) => {
    set({ clipboard: { type: 'cut', path } });
  },

  /**
   * Copy a file or directory to clipboard
   * @param path - Path of the item to copy
   * @returns Promise that resolves when operation completes
   */
  handleCopy: async (path) => {
    set({ clipboard: { type: 'copy', path } });
  },

  /**
   * Paste a previously cut or copied file/directory
   * @param targetPath - Path where to paste the item
   * @returns Promise that resolves when paste operation completes
   */
  handlePaste: async (targetPath) => {
    const { clipboard, directoryStructure, currentDirectory, fileService } = get();
    if (!clipboard.path || !clipboard.type || !directoryStructure || !currentDirectory) return;

    try {
      const fileName = await basename(clipboard.path);
      const destinationPath = await join(targetPath, fileName);
      
      const targetExists = await nativeFs.pathExists(destinationPath);
      if (targetExists) {
        window.alert(`A file or folder with the name "${fileName}" already exists in the destination.`);
        return;
      }
      
      const isDirectory = await nativeFs.isDirectory(clipboard.path);
      
      if (isDirectory) {
        window.alert("Directory paste operations are not fully implemented yet.");
        return;
      } else {
        const fileContent = await nativeFs.readFile(clipboard.path);
        
        await nativeFs.createFile(destinationPath, fileContent);
        
        if (clipboard.type === 'cut') {
          await nativeFs.deletePath(clipboard.path, false);
          set({ clipboard: { type: null, path: null } });
        }
        
        const { openFiles } = get();
        const sourceFileIdx = openFiles.findIndex(f => f.path === clipboard.path);
        
        if (sourceFileIdx !== -1 && clipboard.type === 'copy') {
          console.log('Source file is opened, ensuring destination file will get a new ID when opened');
        }
      }

      try {
        const parentDir = await dirname(destinationPath);
        const parentContents = await fileService.loadDirectoryContents(parentDir);
        
        if (parentContents) {
          set((state) => {
            const updateDirectoryStructure = (
              items: DirectoryItem[] | undefined
            ): DirectoryItem[] | undefined => {
              if (!items) return undefined;

              return items.map((currentItem) => {
                if (currentItem.path === parentDir) {
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
          
          if (clipboard.type === 'cut') {
            const sourceDir = await dirname(clipboard.path);
            if (sourceDir !== parentDir) {
              const sourceContents = await fileService.loadDirectoryContents(sourceDir);
              
              if (sourceContents) {
                set((state) => {
                  const updateDirectoryStructure = (
                    items: DirectoryItem[] | undefined
                  ): DirectoryItem[] | undefined => {
                    if (!items) return undefined;

                    return items.map((currentItem) => {
                      if (currentItem.path === sourceDir) {
                        return {
                          ...currentItem,
                          children: sourceContents,
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
            }
          }
        }
      } catch (error) {
        console.error('Error updating directory contents after paste:', error);
        await get().refreshDirectoryStructure();
      }
    } catch (error) {
      console.error('Error during paste operation:', error);
      window.alert(`Error during paste operation: ${error}`);
    }
  },

  /**
   * Copy the full path of a file/directory to system clipboard
   * @param path - Path to copy
   * @returns Promise that resolves when copy operation completes
   */
  handleCopyPath: async (path) => {
    try {
      await writeText(path);
    } catch (error) {
      console.error('Error copying path to clipboard:', error);
    }
  },

  /**
   * Copy the relative path of a file/directory to system clipboard
   * @param path - Path to convert to relative and copy
   * @returns Promise that resolves when copy operation completes
   */
  handleCopyRelativePath: async (path) => {
    try {
      const { currentDirectory } = get();
      if (!currentDirectory) return;
      
      let relativePath = path;
      if (path.startsWith(currentDirectory)) {
        relativePath = path.substring(currentDirectory.length);
        if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
          relativePath = relativePath.substring(1);
        }
      }
      
      await writeText(relativePath);
    } catch (error) {
      console.error('Error copying relative path to clipboard:', error);
    }
  }
});

/**
 * Import for type checking to avoid compiler errors
 */
import { DirectoryItem } from '@/lib/stores/file-store/types';