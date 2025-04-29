import { create } from 'zustand';
import { FileService, FileInfo, DirectoryItem } from './file-service';
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { dirname, basename, join } from '@tauri-apps/api/path';
import { nativeFs } from './native-fs';

// Audio Store
interface AudioPlayer {
  id: string;
  pause: () => void;
}

interface AudioState {
  activePlayerId: string | null;
  registeredPlayers: Map<string, AudioPlayer>;
  setActivePlayer: (id: string | null) => void;
  registerPlayer: (id: string, pause: () => void) => void;
  unregisterPlayer: (id: string) => void;
  pauseAllExcept: (id: string) => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  activePlayerId: null,
  registeredPlayers: new Map(),

  setActivePlayer: (id) => {
    const { registeredPlayers } = get();
    if (id === null || registeredPlayers.has(id)) {
      set({ activePlayerId: id });
    }
  },

  registerPlayer: (id, pause) => {
    set((state) => {
      const newPlayers = new Map(state.registeredPlayers);
      newPlayers.set(id, { id, pause });
      return { registeredPlayers: newPlayers };
    });
  },

  unregisterPlayer: (id) => {
    set((state) => {
      const newPlayers = new Map(state.registeredPlayers);
      newPlayers.delete(id);
      return {
        registeredPlayers: newPlayers,
        activePlayerId: state.activePlayerId === id ? null : state.activePlayerId
      };
    });
  },

  pauseAllExcept: (id) => {
    const { registeredPlayers } = get();
    registeredPlayers.forEach((player) => {
      if (player.id !== id) {
        player.pause();
      }
    });
  }
}));

// File Store
interface FileState {
  fileService: FileService;
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
  saveFile: () => Promise<void>;
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

export const useFileStore = create<FileState>((set, get) => {
  const fileService = new FileService();

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
    fileService,
    currentFile: null,
    openFiles: [],
    directoryStructure: undefined,
    currentDirectory: null,
    activeFilePath: null,
    clipboard: { type: null, path: null },
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

    setActiveFilePath: (path) => set({ activeFilePath: path }),
    setCurrentFile: (file) => set({ currentFile: file }),
    setCurrentDirectory: (path) => set({ currentDirectory: path }),

    openFile: async () => {
      try {
        const file = await fileService.openFile();
        if (file) {
          updateCurrentFile(file);
        }
        return file;
      } catch (error) {
        return null;
      }
    },

    openFileFromPath: async (path) => {
      try {
        const file = await fileService.openFileFromPath(path);
        if (file) {
          updateCurrentFile(file);
        }
        return file;
      } catch (error) {
        return null;
      }
    },

    openDirectory: async () => {
      try {
        const structure = await fileService.openDirectory();
        if (structure) {
          set({
            directoryStructure: structure,
            currentDirectory: fileService.getCurrentDirectory()
          });
        }
        return structure;
      } catch (error) {
        return null;
      }
    },

    saveFile: async () => {
      const { currentFile } = get();
      if (!currentFile) return;

      try {
        const fileService = new FileService();
        await fileService.saveFile(currentFile.path, currentFile.content);

        set((state) => {
          const fileIndex = state.openFiles.findIndex(f => f.path === currentFile.path);
          if (fileIndex === -1) return state;

          const newOpenFiles = [...state.openFiles];
          newOpenFiles[fileIndex] = {
            ...currentFile,
            isUnsaved: false
          };

          return {
            openFiles: newOpenFiles,
            currentFile: {
              ...currentFile,
              isUnsaved: false
            }
          };
        });
      } catch (error) {
        console.error('Error saving file:', error);
        throw error;
      }
    },

    saveFileAs: async (content) => {
      try {
        const file = await fileService.saveFile(content, true);
        if (file) {
          set({ currentFile: file });
        }
        return file;
      } catch (error) {
        return null;
      }
    },

    updateFileContent: (content) => {
      const { currentFile } = get();
      if (!currentFile) return;

      set((state) => {
        const fileIndex = state.openFiles.findIndex(f => f.path === currentFile.path);
        const updatedFile: FileInfo = {
          id: currentFile.id,
          path: currentFile.path,
          name: currentFile.name,
          content: content,
          isUnsaved: true
        };

        if (fileIndex !== -1) {
          const newOpenFiles = [...state.openFiles];
          newOpenFiles[fileIndex] = updatedFile;
          
          return {
            openFiles: newOpenFiles,
            currentFile: updatedFile,
            activeFilePath: currentFile.path
          };
        } else {
          return {
            openFiles: [...state.openFiles, updatedFile],
            currentFile: updatedFile,
            activeFilePath: currentFile.path
          };
        }
      });
    },

    searchFiles: async (query) => {
      return fileService.searchFiles(query);
    },

    searchFileContents: async (query) => {
      const { currentDirectory } = get();
      if (!currentDirectory) return [];
      return fileService.searchFileContents(query, currentDirectory);
    },

    isImageFile: (filePath) => {
      return fileService.isImageFile(filePath);
    },

    isAudioFile: (filePath) => {
      return fileService.isAudioFile(filePath);
    },

    loadDirectoryContents: async (dirPath, item) => {
      try {
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

    switchToFile: (filePath) => {
      set((state) => {
        const file = state.openFiles.find(f => f.path === filePath);
        if (file) {
          const fileDeepCopy = { 
            id: file.id,
            path: file.path,
            name: file.name,
            content: file.content,
            isUnsaved: file.isUnsaved
          };
          return {
            currentFile: fileDeepCopy,
            activeFilePath: filePath
          };
        }
        return state;
      });
    },

    handleCut: async (path) => {
      set({ clipboard: { type: 'cut', path } });
    },

    handleCopy: async (path) => {
      set({ clipboard: { type: 'copy', path } });
    },

    handlePaste: async (targetPath) => {
      const { clipboard, directoryStructure, currentDirectory } = get();
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
    
    handleRenameSubmit: async (newName) => {
      try {
        const { renameDialog } = get();
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
    },

    handleCopyPath: async (path) => {
      try {
        await writeText(path);
      } catch (error) {
        console.error('Error copying path to clipboard:', error);
      }
    },

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
    },

    openCreateDialog: (path, type) => {
      set({
        createDialog: {
          isOpen: true,
          path,
          type
        }
      });
    },
    
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
    
    handleCreateSubmit: async (name) => {
      try {
        const { createDialog } = get();
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
    
    handleCreateFile: async (dirPath) => {
      get().openCreateDialog(dirPath, 'file');
    },

    handleCreateFolder: async (dirPath) => {
      console.log(`handleCreateFolder called for path: ${dirPath}`);
      get().openCreateDialog(dirPath, 'folder');
    },

    setDirectoryStructure: (structure) => {
      set({ directoryStructure: structure });
    },
    
    refreshDirectoryStructure: async () => {
      try {
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
  };
}); 