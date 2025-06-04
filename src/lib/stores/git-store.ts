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

interface GitStore {
  status: GitStatus | null;
  branches: GitBranch[];
  commits: GitCommit[];
  currentPath: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setCurrentPath: (path: string) => void;
  fetchGitStatus: (path: string) => Promise<void>;
  fetchBranches: (path: string) => Promise<void>;
  fetchCommits: (path: string, limit?: number) => Promise<void>;
  refreshGitData: (path: string) => Promise<void>;
  isGitRepository: (path: string) => Promise<boolean>;
  clearError: () => void;
}

export const useGitStore = create<GitStore>((set, get) => ({
  status: null,
  branches: [],
  commits: [],
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

  refreshGitData: async (path: string) => {
    const { fetchGitStatus, fetchBranches, fetchCommits } = get();
    await Promise.all([
      fetchGitStatus(path),
      fetchBranches(path),
      fetchCommits(path)
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

  clearError: () => {
    set({ error: null });
  }
})); 