import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface GitBranch {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  commit_id: string;
}

export interface GitCommit {
  id: string;
  short_id: string;
  message: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  date: string;
}

export interface GitStatus {
  current_branch: string | null;
  is_repo: boolean;
  has_changes: boolean;
  ahead: number;
  behind: number;
}

export interface GitFileStatus {
  path: string;
  status: string; // "modified", "added", "deleted", "renamed", "untracked"
  staged: boolean;
  unstaged: boolean;
}

export interface GitChanges {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
}

interface GitStore {
  status: GitStatus | null;
  branches: GitBranch[];
  commits: GitCommit[];
  changes: GitChanges | null;
  currentPath: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setCurrentPath: (path: string) => void;
  fetchGitStatus: (path: string) => Promise<void>;
  fetchBranches: (path: string) => Promise<void>;
  fetchCommits: (path: string, limit?: number) => Promise<void>;
  fetchChanges: (path: string) => Promise<void>;
  refreshGitData: (path: string) => Promise<void>;
  isGitRepository: (path: string) => Promise<boolean>;
  
  // File operations
  stageFile: (repoPath: string, filePath: string) => Promise<void>;
  unstageFile: (repoPath: string, filePath: string) => Promise<void>;
  stageAllFiles: (repoPath: string) => Promise<void>;
  commitChanges: (repoPath: string, message: string, authorName: string, authorEmail: string) => Promise<string>;
  
  clearError: () => void;
}

export const useGitStore = create<GitStore>((set, get) => ({
  status: null,
  branches: [],
  commits: [],
  changes: null,
  currentPath: null,
  isLoading: false,
  error: null,

  setCurrentPath: (path: string) => {
    set({ currentPath: path });
  },

  fetchGitStatus: async (path: string) => {
    try {
      set({ isLoading: true, error: null });
      const status = await invoke<GitStatus>('get_git_status', { path });
      set({ status, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch git status',
        isLoading: false 
      });
    }
  },

  fetchBranches: async (path: string) => {
    try {
      set({ isLoading: true, error: null });
      const branches = await invoke<GitBranch[]>('get_git_branches', { path });
      set({ branches, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch branches',
        isLoading: false 
      });
    }
  },

  fetchCommits: async (path: string, limit = 50) => {
    try {
      set({ isLoading: true, error: null });
      const commits = await invoke<GitCommit[]>('get_git_commits', { path, limit });
      set({ commits, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch commits',
        isLoading: false 
      });
    }
  },

  fetchChanges: async (path: string) => {
    try {
      set({ isLoading: true, error: null });
      const changes = await invoke<GitChanges>('get_git_changes', { path });
      set({ changes, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch changes',
        isLoading: false 
      });
    }
  },

  refreshGitData: async (path: string) => {
    const { fetchGitStatus, fetchBranches, fetchCommits, fetchChanges } = get();
    await Promise.all([
      fetchGitStatus(path),
      fetchBranches(path),
      fetchCommits(path),
      fetchChanges(path)
    ]);
  },

  isGitRepository: async (path: string): Promise<boolean> => {
    try {
      const isRepo = await invoke<boolean>('is_git_repository', { path });
      return isRepo;
    } catch (error) {
      console.error('Error checking if directory is git repository:', error);
      return false;
    }
  },

  stageFile: async (repoPath: string, filePath: string) => {
    try {
      set({ isLoading: true, error: null });
      await invoke<void>('stage_file', { repoPath, filePath });
      // Refresh changes after staging
      await get().fetchChanges(repoPath);
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to stage file',
        isLoading: false 
      });
    }
  },

  unstageFile: async (repoPath: string, filePath: string) => {
    try {
      set({ isLoading: true, error: null });
      await invoke<void>('unstage_file', { repoPath, filePath });
      // Refresh changes after unstaging
      await get().fetchChanges(repoPath);
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to unstage file',
        isLoading: false 
      });
    }
  },

  stageAllFiles: async (repoPath: string) => {
    try {
      set({ isLoading: true, error: null });
      await invoke<void>('stage_all_files', { repoPath });
      // Refresh changes after staging all
      await get().fetchChanges(repoPath);
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to stage all files',
        isLoading: false 
      });
    }
  },

  commitChanges: async (repoPath: string, message: string, authorName: string, authorEmail: string): Promise<string> => {
    try {
      set({ isLoading: true, error: null });
      const commitId = await invoke<string>('commit_changes', { 
        repoPath, 
        message, 
        authorName, 
        authorEmail 
      });
      
      // Refresh all git data after commit
      await get().refreshGitData(repoPath);
      set({ isLoading: false });
      
      return commitId;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to commit changes',
        isLoading: false 
      });
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  }
})); 