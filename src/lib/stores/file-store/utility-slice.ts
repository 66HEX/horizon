import { StateCreator } from 'zustand';
import { UtilitySlice, FileSlice, DirectorySlice } from '@/lib/stores/file-store/types';
import { basename, dirname } from '@tauri-apps/api/path';
import * as nativeFs from '@/lib/native-fs';

/**
 * Creator function for the utility operations slice
 * @returns Utility slice with helper functions for file operations
 */
export const createUtilitySlice: StateCreator<
  UtilitySlice & FileSlice & DirectorySlice,
  [],
  [],
  UtilitySlice
> = (set, get) => ({
  /**
   * Check if a file is an image file
   * @param filePath - Path of the file to check
   * @returns True if the file is an image, false otherwise
   */
  isImageFile: (filePath) => {
    const { fileService } = get();
    return fileService.isImageFile(filePath);
  },

  /**
   * Check if a file is an audio file
   * @param filePath - Path of the file to check
   * @returns True if the file is an audio file, false otherwise
   */
  isAudioFile: (filePath) => {
    const { fileService } = get();
    return fileService.isAudioFile(filePath);
  },

  /**
   * Delete a file or directory with confirmation
   * @param path - Path of the item to delete
   * @returns Promise that resolves when delete operation completes
   */
  handleDelete: async (path) => {
    try {
      const name = await basename(path);
      const isDirectory = await nativeFs.isDirectory(path);
      
      const confirmed = await new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          const result = window.confirm(
            `Are you sure you want to delete ${isDirectory ? 'folder' : 'file'} "${name}"?`
          );
          resolve(result);
        });
      });
      
      if (!confirmed) {
        console.log('Deletion cancelled by user');
        return;
      }
      
      const parentDir = await dirname(path);
      
      await nativeFs.deletePath(path, true);
      
      if (get().openFiles.some(f => f.path === path)) {
        get().closeFile(path);
      }
      
      try {
        const { fileService } = get();
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
        }
      } catch (error) {
        console.error('Error updating directory contents after delete:', error);
        await get().refreshDirectoryStructure();
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      window.alert(`Error deleting: ${error}`);
    }
  }
});

/**
 * Import for type checking to avoid compiler errors
 */
import { DirectoryItem } from '@/lib/stores/file-store/types';