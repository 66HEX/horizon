import { readTextFile, readDir, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export interface FileInfo {
  id: string;
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

export interface MatchResult {
  file: DirectoryItem;
  line: number;
  content: string;
}

interface ElectronAPI {
  checkPath(path: string): Promise<void>;
  getPathStats(path: string): Promise<{ isDirectory: boolean }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deletePath(path: string, recursive: boolean): Promise<void>;
  renamePath(oldPath: string, newPath: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface NativeFs {
  getFileInfo(filePath: string): Promise<FileInfo>;
  scanDirectory(dirPath: string, depth?: number, maxDepth?: number): Promise<DirectoryItem[]>;
  readFile(filePath: string): Promise<string>;
  writeToFile(filePath: string, content: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  pathExists(path: string): Promise<boolean>;
  createFile(path: string, content: string): Promise<void>;
  deletePath(path: string, recursive: boolean): Promise<void>;
  renamePath(oldPath: string, newPath: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  searchFileContents(query: string, dirPath: string, maxResults?: number): Promise<DirectoryItem[]>;
  searchFileContentsAdvanced(
    query: string,
    dirPath: string,
    maxResults?: number,
    ignoreCase?: boolean,
    includePatterns?: string[],
    excludePatterns?: string[]
  ): Promise<MatchResult[]>;
  searchFilesByName(query: string, dirPath: string, maxResults?: number): Promise<DirectoryItem[]>;
  searchFilesByNameAdvanced(
    query: string,
    dirPath: string,
    maxResults?: number,
    includePatterns?: string[],
    excludePatterns?: string[]
  ): Promise<DirectoryItem[]>;
  isImageFile(filePath: string): Promise<boolean>;
  isAudioFile(filePath: string): Promise<boolean>;
}

export const nativeFs: NativeFs = {
  async getFileInfo(filePath: string): Promise<FileInfo> {
    const content = await readTextFile(filePath);
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
    const id = `${filePath}-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
    
    return {
      id,
      path: filePath,
      name: fileName,
      content,
      isUnsaved: false
    };
  },

  async scanDirectory(dirPath: string, depth: number = 0, maxDepth: number = 2): Promise<DirectoryItem[]> {
    const entries = await readDir(dirPath);
    const result: DirectoryItem[] = [];

    for (const entry of entries) {
      const entryPath = await join(dirPath, entry.name);
      const item: DirectoryItem = {
        name: entry.name,
        path: entryPath,
        isDirectory: entry.isDirectory,
        type: entry.isDirectory ? 'directory' : 'file'
      };

      if (entry.isDirectory && depth < maxDepth) {
        item.children = await nativeFs.scanDirectory(entryPath, depth + 1, maxDepth);
      } else if (entry.isDirectory) {
        item.children = [];
        item.needsLoading = true;
      }

      result.push(item);
    }

    return result.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  },

  async readFile(filePath: string): Promise<string> {
    return await readTextFile(filePath);
  },


  async writeToFile(filePath: string, content: string): Promise<void> {
    await writeTextFile(filePath, content);
  },

/**
 * Write text to a file, overwriting existing content
 * @param path - Path of the file
 * @param content - Content to write
 * @returns Promise that resolves when operation completes
 */
export async function writeToFile(path: string, content: string): Promise<void> {
  console.log(`[native-fs] writeToFile called for path: ${path}`);
  console.log(`[native-fs] Content type: ${typeof content}, length: ${content.length}`);
  console.log(`[native-fs] Content preview: "${content.substring(0, 50)}..."`);
  
  if (typeof content !== 'string') {
    console.error(`[native-fs] Invalid content type: ${typeof content}`);
    content = String(content);
    console.log(`[native-fs] Converted content length: ${content.length}`);
  }
  
  if (content.includes('\0')) {
    console.warn(`[native-fs] Content contains null characters, cleaning...`);
    content = content.replace(/\0/g, '');
    console.log(`[native-fs] Cleaned content length: ${content.length}`);
  }
  
  return invoke('write_to_file', { path, content });
}


  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await window.electronAPI.getPathStats(path);
      return stats.isDirectory;
    } catch {
      return false;
    }
  },

  async pathExists(path: string): Promise<boolean> {
    try {
      await window.electronAPI.checkPath(path);
      return true;
    } catch {
      return false;
    }
  },

  async createFile(path: string, content: string): Promise<void> {
    await window.electronAPI.writeFile(path, content);
  },

  async deletePath(path: string, recursive: boolean = false): Promise<void> {
    await window.electronAPI.deletePath(path, recursive);
  },

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    await window.electronAPI.renamePath(oldPath, newPath);
  },

  async createDirectory(path: string): Promise<void> {
    await window.electronAPI.createDirectory(path);
  },

  async searchFileContents(query: string, dirPath: string, maxResults: number = 20): Promise<DirectoryItem[]> {
    const results: DirectoryItem[] = [];
    const entries = await readDir(dirPath);

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const entryPath = await join(dirPath, entry.name);
      if (!entry.isDirectory) {
        try {
          const content = await readTextFile(entryPath);
          if (content.toLowerCase().includes(query.toLowerCase())) {
            results.push({
              name: entry.name,
              path: entryPath,
              isDirectory: false,
              type: 'file'
            });
          }
        } catch (error) {
          console.error(`Error reading file ${entryPath}:`, error);
        }
      }
    }

    return results;
  },

  async searchFileContentsAdvanced(
    query: string,
    dirPath: string,
    maxResults: number = 20,
    ignoreCase: boolean = true,
    includePatterns?: string[],
    excludePatterns?: string[]
  ): Promise<MatchResult[]> {
    const results: MatchResult[] = [];
    const entries = await readDir(dirPath);

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const entryPath = await join(dirPath, entry.name);
      if (!entry.isDirectory) {
        // Check if file matches include/exclude patterns
        const fileName = entry.name.toLowerCase();
        if (includePatterns && !includePatterns.some(pattern => fileName.endsWith(pattern.toLowerCase()))) {
          continue;
        }
        if (excludePatterns && excludePatterns.some(pattern => fileName.endsWith(pattern.toLowerCase()))) {
          continue;
        }

        try {
          const content = await readTextFile(entryPath);
          const lines = content.split('\n');
          const searchQuery = ignoreCase ? query.toLowerCase() : query;

          for (let i = 0; i < lines.length; i++) {
            const line = ignoreCase ? lines[i].toLowerCase() : lines[i];
            if (line.includes(searchQuery)) {
              results.push({
                file: {
                  name: entry.name,
                  path: entryPath,
                  isDirectory: false,
                  type: 'file'
                },
                line: i + 1,
                content: lines[i]
              });
              if (results.length >= maxResults) break;
            }
          }
        } catch (error) {
          console.error(`Error reading file ${entryPath}:`, error);
        }
      }
    }

    return results;
  },

  async searchFilesByName(query: string, dirPath: string, maxResults: number = 20): Promise<DirectoryItem[]> {
    const results: DirectoryItem[] = [];
    const entries = await readDir(dirPath);
    const searchQuery = query.toLowerCase();

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const entryPath = await join(dirPath, entry.name);
      if (entry.name.toLowerCase().includes(searchQuery)) {
        results.push({
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory,
          type: entry.isDirectory ? 'directory' : 'file'
        });
      }
    }

    return results;
  },

  async searchFilesByNameAdvanced(
    query: string,
    dirPath: string,
    maxResults: number = 20,
    includePatterns?: string[],
    excludePatterns?: string[]
  ): Promise<DirectoryItem[]> {
    const results: DirectoryItem[] = [];
    const entries = await readDir(dirPath);
    const searchQuery = query.toLowerCase();

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const entryPath = await join(dirPath, entry.name);
      const fileName = entry.name.toLowerCase();

      // Check if file matches include/exclude patterns
      if (includePatterns && !includePatterns.some(pattern => fileName.endsWith(pattern.toLowerCase()))) {
        continue;
      }
      if (excludePatterns && excludePatterns.some(pattern => fileName.endsWith(pattern.toLowerCase()))) {
        continue;
      }

      if (fileName.includes(searchQuery)) {
        results.push({
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory,
          type: entry.isDirectory ? 'directory' : 'file'
        });
      }
    }

    return results;
  },

  async isImageFile(filePath: string): Promise<boolean> {
    const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    const path = filePath.toLowerCase();
    return extensions.some(ext => path.endsWith(ext));
  },

  async isAudioFile(filePath: string): Promise<boolean> {
    const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    const path = filePath.toLowerCase();
    return extensions.some(ext => path.endsWith(ext));
  }
};