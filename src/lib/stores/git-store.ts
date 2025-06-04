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

export interface GitRemoteStatus {
  remote_name: string;
  remote_url: string | null;
  ahead: number;
  behind: number;
  has_remote: boolean;
}

export interface GitPushResult {
  success: boolean;
  message: string;
  pushed_commits: number;
}

export interface GitPullResult {
  success: boolean;
  message: string;
  new_commits: number;
  conflicts: string[];
}

interface GitStore {
  status: GitStatus | null;
  branches: GitBranch[];
  commits: GitCommit[];
  changes: GitChanges | null;
  remoteStatus: GitRemoteStatus | null;
  currentPath: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setCurrentPath: (path: string) => void;
  fetchGitStatus: (path: string) => Promise<void>;
  fetchBranches: (path: string) => Promise<void>;
  fetchCommits: (path: string, limit?: number) => Promise<void>;
  fetchChanges: (path: string) => Promise<void>;
  fetchRemoteStatus: (path: string) => Promise<void>;
  refreshGitData: (path: string) => Promise<void>;
  isGitRepository: (path: string) => Promise<boolean>;
  
  // File operations
  stageFile: (repoPath: string, filePath: string) => Promise<void>;
  unstageFile: (repoPath: string, filePath: string) => Promise<void>;
  stageAllFiles: (repoPath: string) => Promise<void>;
  commitChanges: (repoPath: string, message: string, authorName: string, authorEmail: string) => Promise<string>;
  
  // Remote operations
  fetchFromRemote: (repoPath: string, remoteName?: string) => Promise<string>;
  pullFromRemote: (repoPath: string, remoteName?: string) => Promise<GitPullResult>;
  pushToRemote: (repoPath: string, remoteName?: string) => Promise<GitPushResult>;
  
  clearError: () => void;

  discardAllChanges: (repoPath: string) => Promise<void>;
}

export const useGitStore = create<GitStore>((set, get) => ({
  status: null,
  branches: [],
  commits: [],
  changes: null,
  remoteStatus: null,
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

  fetchRemoteStatus: async (path: string) => {
    try {
      set({ isLoading: true, error: null });
      const remoteStatus = await invoke<GitRemoteStatus>('get_remote_status', { repoPath: path });
      set({ remoteStatus, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch remote status',
        isLoading: false 
      });
    }
  },

  refreshGitData: async (path: string) => {
    const { fetchGitStatus, fetchBranches, fetchCommits, fetchChanges, fetchRemoteStatus } = get();
    await Promise.all([
      fetchGitStatus(path),
      fetchBranches(path),
      fetchCommits(path),
      fetchChanges(path),
      fetchRemoteStatus(path)
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

  fetchFromRemote: async (repoPath: string, remoteName?: string) => {
    try {
      set({ isLoading: true, error: null });
      const remoteUrl = await invoke<string>('fetch_from_remote', { repoPath, remoteName });
      set({ isLoading: false });
      return remoteUrl;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch from remote',
        isLoading: false 
      });
      throw error;
    }
  },

  pullFromRemote: async (repoPath: string, remoteName?: string) => {
    try {
      set({ isLoading: true, error: null });
      const pullResult = await invoke<GitPullResult>('pull_from_remote', { repoPath, remoteName });
      set({ isLoading: false });
      return pullResult;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to pull from remote',
        isLoading: false 
      });
      throw error;
    }
  },

  pushToRemote: async (repoPath: string, remoteName?: string) => {
    try {
      set({ isLoading: true, error: null });
      const pushResult = await invoke<GitPushResult>('push_to_remote', { repoPath, remoteName });
      set({ isLoading: false });
      return pushResult;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to push to remote',
        isLoading: false 
      });
      throw error;
    }
  },

  discardAllChanges: async (repoPath: string) => {
    try {
      set({ isLoading: true, error: null });
      const result = await invoke<string>('discard_all_changes', { repoPath });
      console.log('Discard result:', result);
      
      // Refresh git data after discarding changes
      await get().fetchGitStatus(repoPath);
      await get().fetchChanges(repoPath);
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to discard changes',
        isLoading: false 
      });
    }
  },

  clearError: () => {
    set({ error: null });
  }
})); 