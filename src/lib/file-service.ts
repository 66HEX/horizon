import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readDir} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import * as nativeFs from './native-fs';

export interface FileInfo {
  path: string;
  name: string;
  content: string;
  isUnsaved?: boolean;
}

export interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  type: 'file' | 'directory';
  children?: DirectoryItem[];
  needsLoading?: boolean;
}

let fileServiceInstance: FileService | null = null;

export class FileService {
  private currentFile: FileInfo | null = null;
  private currentDirectory: string | null = null;
  private directoryStructure: DirectoryItem[] | null = null;
  private fileContentIndex: Map<string, string> = new Map();
  private fileSearchIndex: Map<string, Set<string>> = new Map();
  private indexingInProgress: boolean = false;

  constructor() {
    if (fileServiceInstance) {
      return fileServiceInstance;
    }
    fileServiceInstance = this;
  }

  static getInstance(): FileService {
    if (!fileServiceInstance) {
      fileServiceInstance = new FileService();
    }
    return fileServiceInstance;
  }

  /**
   * Opens a file and returns its content
   */
  async openFile(): Promise<FileInfo | null> {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Source Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
          { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!selected) {
        return null;
      }

      const filePath = selected as string;
      
      // Use native Rust function to get file info
      try {
        const fileInfo = await nativeFs.getFileInfo(filePath);
        this.currentFile = {
          path: fileInfo.path,
          name: fileInfo.name,
          content: fileInfo.content,
          isUnsaved: fileInfo.is_unsaved
        };
        return this.currentFile;
      } catch (error) {
        console.error('Error using native file info, falling back to JS implementation:', error);
        const content = await readTextFile(filePath);
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
        this.currentFile = {
          path: filePath,
          name: fileName,
          content
        };
        return this.currentFile;
      }
    } catch (error) {
      console.error('Błąd podczas otwierania pliku:', error);
      throw error;
    }
  }
  
  /**
   * Opens a directory and returns its structure
   */
  async openDirectory(): Promise<DirectoryItem[] | null> {
    try {
      // Open folder selection dialog
      const selected = await open({
        directory: true,
        multiple: false
      });

      if (!selected) {
        return null;
      }

      const dirPath = selected as string;
      this.currentDirectory = dirPath;
      
      this.fileContentIndex.clear();
      this.fileSearchIndex.clear();
      
      // Use native Rust function to scan directory
      try {
        const rustItems = await nativeFs.scanDirectory(dirPath, 0, 2);
        // Convert the Rust items to our DirectoryItem format
        this.directoryStructure = this.convertRustDirectoryItems(rustItems);
      } catch (error) {
        console.error('Error using native directory scanning, falling back to JS implementation:', error);
        this.directoryStructure = await this.scanDirectory(dirPath);
      }
      
      setTimeout(() => this.indexDirectoryContents(), 1000);
      
      return this.directoryStructure;
    } catch (error) {
      console.error('Error opening directory:', error);
      throw error;
    }
  }

  /**
   * Converts Rust DirectoryItems to our DirectoryItem format
   */
  private convertRustDirectoryItems(rustItems: nativeFs.DirectoryItem[]): DirectoryItem[] {
    return rustItems.map(item => ({
      name: item.name,
      path: item.path,
      isDirectory: item.is_directory,
      type: item.is_directory ? 'directory' : 'file',
      children: item.children ? this.convertRustDirectoryItems(item.children) : undefined,
      needsLoading: item.needs_loading
    }));
  }

  /**
   * Scans a directory and returns its structure
   * @param dirPath - Path to the directory to scan
   * @param depth - Current depth in the directory tree
   * @returns Array of directory items
   */
  private async scanDirectory(dirPath: string, depth: number = 0): Promise<DirectoryItem[]> {
    try {
      console.log(`Scanning directory: ${dirPath} at depth ${depth}`);
      
      // Try to use Rust implementation
      try {
        const rustItems = await nativeFs.scanDirectory(dirPath, depth, 2);
        return this.convertRustDirectoryItems(rustItems);
      } catch (error) {
        console.error('Error with Rust directory scanning, falling back to JS:', error);
        
        // Fallback to JS implementation
        const entries = await readDir(dirPath);
        console.log(`Found ${entries.length} entries in ${dirPath}`);
        const result: DirectoryItem[] = [];

        const maxInitialDepth = 2;

        for (const entry of entries) {
          const entryPath = await join(dirPath, entry.name);
          
          const item: DirectoryItem = {
            name: entry.name,
            path: entryPath,
            isDirectory: entry.isDirectory,
            type: entry.isDirectory ? 'directory' : 'file'
          };

          if (entry.isDirectory) {
            console.log(`Entry ${entry.name} in ${dirPath} identified as directory`);
          }

          if (item.isDirectory) {
            if (depth < maxInitialDepth) {
              item.children = await this.scanDirectory(item.path, depth + 1);
            } else {
              item.children = [];
              item.needsLoading = true;
            }
          }

          result.push(item);
        }

        return result.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Loads the contents of a directory
   * @param dirPath - Path to the directory
   * @returns Array of directory items
   */
  async loadDirectoryContents(dirPath: string): Promise<DirectoryItem[]> {
    try {
      // Use Rust implementation
      try {
        const rustItems = await nativeFs.scanDirectory(dirPath, 0, 0);
        return this.convertRustDirectoryItems(rustItems);
      } catch (error) {
        console.error('Error with Rust directory content loading, falling back to JS:', error);
        return await this.scanDirectory(dirPath, 0);
      }
    } catch (error) {
      console.error(`Error loading directory contents for ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Refreshes the current directory structure without opening a dialog
   * @returns Array of directory items or null if no current directory
   */
  async refreshCurrentDirectory(): Promise<DirectoryItem[] | null> {
    try {
      if (!this.currentDirectory) {
        return null;
      }
      
      // Use Rust implementation
      try {
        const rustItems = await nativeFs.scanDirectory(this.currentDirectory, 0, 2);
        this.directoryStructure = this.convertRustDirectoryItems(rustItems);
      } catch (error) {
        console.error('Error with Rust directory scanning on refresh, falling back to JS:', error);
        this.directoryStructure = await this.scanDirectory(this.currentDirectory);
      }
      
      return this.directoryStructure;
    } catch (error) {
      console.error(`Error refreshing current directory:`, error);
      return null;
    }
  }

  /**
   * Opens a file from a given path
   * @param filePath - Path to the file
   * @returns File information or null if failed
   */
  async openFileFromPath(filePath: string): Promise<FileInfo | null> {
    try {
      // Use native Rust function to get file info
      try {
        const fileInfo = await nativeFs.getFileInfo(filePath);
        this.currentFile = {
          path: fileInfo.path,
          name: fileInfo.name,
          content: fileInfo.content,
          isUnsaved: fileInfo.is_unsaved
        };
        return this.currentFile;
      } catch (error) {
        console.error('Error using native file info, falling back to JS implementation:', error);
        const content = await readTextFile(filePath);
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
        this.currentFile = {
          path: filePath,
          name: fileName,
          content
        };
        return this.currentFile;
      }
    } catch (error) {
      console.error('Error opening file from path:', error);
      throw error;
    }
  }

  /**
   * Saves a file with the given content
   * @param content - Content to save
   * @param saveAs - Whether to show save dialog even if file exists
   * @returns File information or null if failed
   */
  async saveFile(content: string, saveAs: boolean = false): Promise<FileInfo | null> {
    try {
      let filePath: string | null = null;

      if (saveAs || !this.currentFile) {
        const selected = await save({
          filters: [
            { name: 'Source Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (!selected) {
          return null;
        }

        filePath = selected as string;
      } else {
        filePath = this.currentFile.path;
      }

      // Use native Rust function to write file
      try {
        await nativeFs.writeToFile(filePath, content);
      } catch (error) {
        console.error('Error using native file writing, falling back to JS implementation:', error);
        await writeTextFile(filePath, content);
      }

      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
      this.currentFile = {
        path: filePath,
        name: fileName,
        content,
        isUnsaved: false
      };

      return this.currentFile;
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }

  /**
   * Gets the current file
   * @returns Current file or null
   */
  getCurrentFile(): FileInfo | null {
    return this.currentFile;
  }

  /**
   * Gets the current directory structure
   * @returns Directory structure or null
   */
  getCurrentDirectoryStructure(): DirectoryItem[] | null {
    return this.directoryStructure;
  }

  /**
   * Gets the current directory
   * @returns Current directory or null
   */
  getCurrentDirectory(): string | null {
    return this.currentDirectory;
  }

  /**
   * Konwertuje DirectoryItem z nativeFs do formatu używanego w aplikacji
   * @param items - Tablica elementów do przekonwertowania
   * @returns Przekonwertowana tablica DirectoryItem
   */
  private mapNativeFsItems(items: nativeFs.DirectoryItem[]): DirectoryItem[] {
    return items.map(item => ({
      name: item.name,
      path: item.path,
      isDirectory: item.is_directory,
      type: item.is_directory ? 'directory' : 'file',
      children: item.children ? this.mapNativeFsItems(item.children) : undefined,
      needsLoading: item.needs_loading
    }));
  }

  /**
   * Searches file contents for the query
   * @param query - Search query
   * @param maxResults - Maximum number of results
   * @returns Array of items containing the query
   */
  async searchFileContents(query: string, maxResults: number = 20): Promise<DirectoryItem[]> {
    if (!query || !this.currentDirectory) {
      return [];
    }
    
    try {
      // Use the new, more efficient Rust implementation for search
      const results = await nativeFs.searchFileContents(query, this.currentDirectory, maxResults);
      return this.mapNativeFsItems(results);
    } catch (error) {
      console.error('Error searching file contents:', error);
      return [];
    }
  }

  /**
   * Searches file contents with advanced options
   * @param query - Search query
   * @param maxResults - Maximum number of results
   * @param ignoreCase - Whether to ignore case
   * @param includePatterns - Optional glob patterns to include
   * @param excludePatterns - Optional glob patterns to exclude
   * @returns Array of match results with context
   */
  async searchFileContentsAdvanced(
    query: string, 
    maxResults: number = 20,
    ignoreCase: boolean = true,
    includePatterns?: string[],
    excludePatterns?: string[]
  ): Promise<nativeFs.MatchResult[]> {
    if (!query || !this.currentDirectory) {
      return [];
    }
    
    try {
      // Use the advanced Rust implementation
      return await nativeFs.searchFileContentsAdvanced(
        query, 
        this.currentDirectory, 
        maxResults,
        ignoreCase,
        includePatterns,
        excludePatterns
      );
    } catch (error) {
      console.error('Error with advanced file content search:', error);
      return [];
    }
  }

  /**
   * Checks if a file is an image
   * @param filePath - Path to the file
   * @returns True if the file is an image
   */
  isImageFile(filePath: string): boolean {
    try {
      // Try Rust implementation synchronously
      const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
      const path = filePath.toLowerCase();
      return extensions.some(ext => path.endsWith(ext));
    } catch (error) {
      console.error('Error checking if file is an image:', error);
      const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
      const path = filePath.toLowerCase();
      return extensions.some(ext => path.endsWith(ext));
    }
  }

  /**
   * Checks if a file is an audio file
   * @param filePath - Path to the file
   * @returns True if the file is an audio file
   */
  isAudioFile(filePath: string): boolean {
    try {
      // Try Rust implementation synchronously
      const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
      const path = filePath.toLowerCase();
      return extensions.some(ext => path.endsWith(ext));
    } catch (error) {
      console.error('Error checking if file is an audio file:', error);
      const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
      const path = filePath.toLowerCase();
      return extensions.some(ext => path.endsWith(ext));
    }
  }

  /**
   * Asynchronously checks if a file is an image
   * @param filePath - Path to the file
   * @returns Promise resolving to true if the file is an image
   */
  async isImageFileAsync(filePath: string): Promise<boolean> {
    try {
      // Try Rust implementation
      return await nativeFs.isImageFile(filePath);
    } catch (error) {
      console.error('Error with Rust image check, falling back to JS:', error);
      const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
      const path = filePath.toLowerCase();
      return extensions.some(ext => path.endsWith(ext));
    }
  }

  /**
   * Asynchronously checks if a file is an audio file
   * @param filePath - Path to the file
   * @returns Promise resolving to true if the file is an audio file
   */
  async isAudioFileAsync(filePath: string): Promise<boolean> {
    try {
      // Try Rust implementation
      return await nativeFs.isAudioFile(filePath);
    } catch (error) {
      console.error('Error with Rust audio check, falling back to JS:', error);
      const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
      const path = filePath.toLowerCase();
      return extensions.some(ext => path.endsWith(ext));
    }
  }

  /**
   * Searches for files by name
   * @param query - Search query
   * @param maxResults - Maximum number of results
   * @returns Array of items matching the query in name
   */
  async searchFiles(query: string, maxResults: number = 20): Promise<DirectoryItem[]> {
    if (!query || !this.currentDirectory) {
      return [];
    }
    
    try {
      // Use the new, more efficient Rust implementation for search
      const results = await nativeFs.searchFilesByName(query, this.currentDirectory, maxResults);
      return this.mapNativeFsItems(results);
    } catch (error) {
      console.error('Error searching files by name:', error);
      return [];
    }
  }

  /**
   * Searches for files by name with advanced options
   * @param query - Search query
   * @param maxResults - Maximum number of results
   * @param includePatterns - Optional glob patterns to include
   * @param excludePatterns - Optional glob patterns to exclude
   * @returns Array of items matching the query in name
   */
  async searchFilesAdvanced(
    query: string, 
    maxResults: number = 20,
    includePatterns?: string[],
    excludePatterns?: string[]
  ): Promise<DirectoryItem[]> {
    if (!query || !this.currentDirectory) {
      return [];
    }
    
    try {
      // Use the advanced Rust implementation
      const results = await nativeFs.searchFilesByNameAdvanced(
        query, 
        this.currentDirectory,
        maxResults,
        includePatterns,
        excludePatterns
      );
      return this.mapNativeFsItems(results);
    } catch (error) {
      console.error('Error with advanced file name search:', error);
      return [];
    }
  }

  /**
   * Stops file indexing in memory as it's now handled by the backend
   */
  private async indexDirectoryContents() {
    // This method is kept for compatibility but is essentially a no-op now
    // since indexing and searching is now handled by the backend
    console.log('File indexing is now handled by the backend');
  }
}