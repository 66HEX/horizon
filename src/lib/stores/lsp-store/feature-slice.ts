import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { LspStoreState } from '@/lib/stores/lsp-store/types';
import { 
  CompletionItem, 
  DiagnosticItem, 
  HoverInfo, 
  Position, 
  Location,
  TextEdit,
  LspResponse,
  UIEnhancedHoverData
} from '@/lib/stores/lsp-store/types';

/**
 * Interface for LSP feature-related state and operations
 */
export interface FeaturesSlice {
  /**
   * State properties
   */
  completions: CompletionItem[];
  diagnostics: DiagnosticItem[];
  
  /**
   * Feature action methods
   */
  getCompletions: (filePath: string, position: Position) => Promise<CompletionItem[]>;
  getDiagnostics: (filePath: string) => Promise<DiagnosticItem[]>;
  getHoverInfo: (filePath: string, position: Position) => Promise<HoverInfo | null>;
  gotoDefinition: (filePath: string, position: Position) => Promise<Location | null>;
  formatDocument: (filePath: string) => Promise<TextEdit[]>;
}

/**
 * Creator function for the LSP features slice
 * @returns Features slice with state and actions for LSP features
 */
export const createFeaturesSlice: StateCreator<
  LspStoreState, 
  [], 
  [], 
  FeaturesSlice
> = (set, get) => ({
  /**
   * State properties
   */
  completions: [],
  diagnostics: [],
  
  /**
   * Get code completions from the language server
   * @param filePath - Path of the file
   * @param position - Cursor position in the file
   * @returns Promise that resolves to completion items
   */
  getCompletions: async (filePath, position) => {
    const { isServerRunning, currentLanguage, webSocketClient } = get();
    
    if (!isServerRunning || !currentLanguage || !webSocketClient) {
      return [];
    }
    
    set({ isLoading: true, error: null });
    
    try {
      const response = await webSocketClient.sendRequest<LspResponse>({
        type: 'Completion',
        payload: { file_path: filePath, position }
      });
      
      if (response.type === 'Completion') {
        const completions = response.payload.items;
        set({ completions, isLoading: false });
        return completions;
      } else if (response.type === 'Error') {
        throw new Error(response.payload.message);
      } else {
        throw new Error('Invalid response type');
      }
    } catch (error) {
      set({ 
        error: `Failed to get completions: ${error}`, 
        isLoading: false 
      });
      return [];
    }
  },
  
  /**
   * Get diagnostics for a file
   * @param filePath - Path of the file
   * @returns Promise that resolves to diagnostic items
   */
  getDiagnostics: async (filePath) => {
    const { isServerRunning, currentLanguage, webSocketClient, diagnostics } = get();
    
    if (!isServerRunning || !currentLanguage || !webSocketClient) {
      return [];
    }
    
    return diagnostics;
  },
  
  /**
   * Get hover information for a position in a file
   * @param filePath - Path of the file
   * @param position - Cursor position in the file
   * @returns Promise that resolves to hover information or null
   */
  getHoverInfo: async (filePath, position) => {
    const { isServerRunning, currentLanguage, webSocketClient } = get();
    
    if (!isServerRunning || !currentLanguage || !webSocketClient) {
      return null;
    }
    
    try {
      const response = await webSocketClient.sendRequest<LspResponse>({
        type: 'Hover',
        payload: { file_path: filePath, position }
      });
      
      if (response.type === 'Hover') {
        if (!response.payload.contents) {
          return null;
        }
        
        try {
          try {
            const enhancedData = await invoke<UIEnhancedHoverData>('format_hover_data_enhanced', { 
              contents: response.payload.contents 
            });
            
            return { 
              contents: response.payload.contents,
              enhancedContents: enhancedData
            };
          } catch (enhancedError) {
            console.error('Enhanced formatting failed:', enhancedError);
            return { contents: response.payload.contents };
          }
        } catch (formattingError) {
          console.error('Error during hover formatting:', formattingError);
          return { contents: response.payload.contents };
        }
      } else if (response.type === 'Error') {
        throw new Error(response.payload.message);
      } else {
        throw new Error('Invalid response type');
      }
    } catch (error) {
      set({ error: `Failed to get hover info: ${error}` });
      return null;
    }
  },
  
  /**
   * Go to definition of symbol at position
   * @param filePath - Path of the file
   * @param position - Cursor position in the file
   * @returns Promise that resolves to symbol location or null
   */
  gotoDefinition: async (filePath, position) => {
    const { isServerRunning, currentLanguage, webSocketClient } = get();
    
    if (!isServerRunning || !currentLanguage || !webSocketClient) {
      return null;
    }
    
    try {
      const response = await webSocketClient.sendRequest<LspResponse>({
        type: 'Definition',
        payload: { file_path: filePath, position }
      });
      
      if (response.type === 'Definition') {
        return response.payload.location;
      } else if (response.type === 'Error') {
        throw new Error(response.payload.message);
      } else {
        throw new Error('Invalid response type');
      }
    } catch (error) {
      set({ error: `Failed to go to definition: ${error}` });
      return null;
    }
  },
  
  /**
   * Format a document using the language server
   * @param filePath - Path of the file to format
   * @returns Promise that resolves to formatting text edits
   */
  formatDocument: async (filePath) => {
    const { isServerRunning, webSocketClient, currentLanguage } = get();
    
    if (!isServerRunning || !currentLanguage || !webSocketClient) {
      return [];
    }
    
    try {
      const serverCapabilities = webSocketClient.getServerCapabilities();
      if (serverCapabilities && 
          !serverCapabilities.documentFormattingProvider) {
        console.warn('LSP server does not support document formatting');
        return [];
      }
      
      const response = await webSocketClient.sendRequest<LspResponse>({
        type: 'Formatting',
        payload: { file_path: filePath }
      });
      
      if (response.type === 'Formatting') {
        return response.payload.edits;
      } else if (response.type === 'Error') {
        throw new Error(response.payload.message);
      } else {
        throw new Error('Invalid response type');
      }
    } catch (error) {
      set({ error: `Failed to format document: ${error}` });
      return [];
    }
  }
});