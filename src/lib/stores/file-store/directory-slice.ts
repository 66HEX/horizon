import { StateCreator } from 'zustand';
import { DirectorySlice, FileSlice, DirectoryItem } from '@/lib/stores/file-store/types';

/**
 * Creator function for the directory operations slice
 * @returns Directory slice with state and actions for directory operations
 */
export const createDirectorySlice: StateCreator<
  DirectorySlice & FileSlice,
  [],
  [],
  DirectorySlice
> = (set, get) => ({
  /**
   * State properties
   */
  directoryStructure: undefined,
  currentDirectory: null,
  
  /**
   * Set the current working directory
   * @param path - Path to set as current directory or null
   */
  setCurrentDirectory: (path) => set({ currentDirectory: path }),
  
  /**
   * Open a directory using directory picker dialog
   * @returns Promise that resolves to directory structure or null
   */
  openDirectory: async () => {
    try {
      const { fileService } = get();
      const structure = await fileService.openDirectory();
      if (structure) {
        set({
          directoryStructure: structure,
          currentDirectory: fileService.getCurrentDirectory()
        });
      }
      return structure;
    } catch (error) {
      console.error('Error in openDirectory:', error);
      return null;
    }
  },
  
  /**
   * Load contents of a directory
   * @param dirPath - Path of the directory to load
   * @param item - Directory item to update with contents
   * @returns Promise that resolves when load completes
   */
  loadDirectoryContents: async (dirPath, item) => {
    try {
      const { fileService } = get();
      const contents = await fileService.loadDirectoryContents(dirPath);
      if (contents) {
        set((state) => {
          const updateDirectoryStructure = (
            items: DirectoryItem[] | undefined
          ): DirectoryItem[] | undefined => {
            if (!items) return undefined;

            return items.map((currentItem) => {
              if (currentItem.path === item.path) {
                return {
                  ...currentItem,
                  children: contents,
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
      console.error('Error loading directory contents:', error);
    }
  },
  
  /**
   * Search for files by name
   * @param query - Search query
   * @returns Promise that resolves to search results
   */
  searchFiles: async (query) => {
    try {
      const { fileService } = get();
      return await fileService.searchFiles(query);
    } catch (error) {
      console.error('Error searching files:', error);
      return [];
    }
  },
  
  /**
   * Search in file contents
   * @param query - Search query
   * @returns Promise that resolves to search results
   */
  searchFileContents: async (query) => {
    try {
      const { fileService } = get();
      return await fileService.searchFileContents(query);
    } catch (error) {
      console.error('Error searching file contents:', error);
      return [];
    }
  },
  
  /**
   * Set the directory structure
   * @param structure - New directory structure or undefined
   */
  setDirectoryStructure: (structure) => {
    set({ directoryStructure: structure });
  },
  
  /**
   * Refresh the current directory structure
   * @returns Promise that resolves when refresh completes
   */
  refreshDirectoryStructure: async () => {
    try {
      const { fileService } = get();
      const structure = await fileService.refreshCurrentDirectory();
      if (structure) {
        set((state) => {
          const mergeStructure = (
            newItems: DirectoryItem[],
            oldItems: DirectoryItem[] | undefined
          ): DirectoryItem[] => {
            if (!oldItems) return newItems;
            
            return newItems.map(newItem => {
              const oldItem = oldItems.find(item => item.path === newItem.path);
              
              if (oldItem && newItem.isDirectory && oldItem.isDirectory) {
                if (oldItem.children && !oldItem.needsLoading) {
                  return {
                    ...newItem,
                    children: oldItem.children.length > 0 ? 
                      mergeStructure(newItem.children || [], oldItem.children) : 
                      newItem.children,
                    needsLoading: false 
                  };
                }
              }
              
              return newItem;
            });
          };
          
          return {
            directoryStructure: mergeStructure(structure, state.directoryStructure)
          };
        });
      } else {
        console.error("Failed to refresh directory structure - null result");
      }
    } catch (error) {
      console.error('Error refreshing directory structure:', error);
    }
  }
});