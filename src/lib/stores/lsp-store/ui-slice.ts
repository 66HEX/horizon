import { StateCreator } from 'zustand';
import { LspStoreState } from '@/lib/stores/lsp-store/types';

/**
 * Interface for UI-related state and operations
 */
export interface UISlice {
  /**
   * State properties
   */
  isLoading: boolean;
  error: string | null;
  
  /**
   * UI action methods
   */
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Creator function for the UI operations slice
 * @returns UI slice with state and actions for UI operations
 */
export const createUISlice: StateCreator<
  LspStoreState, 
  [], 
  [], 
  UISlice
> = (set) => ({
  /**
   * State properties
   */
  isLoading: false,
  error: null,
  
  /**
   * Set the loading state
   * @param loading - Whether the application is in a loading state
   */
  setLoading: (loading) => set({ isLoading: loading }),
  
  /**
   * Set an error message
   * @param error - The error message or null to clear
   */
  setError: (error) => set({ error }),
  
  /**
   * Clear the current error message
   */
  clearError: () => set({ error: null }),
});