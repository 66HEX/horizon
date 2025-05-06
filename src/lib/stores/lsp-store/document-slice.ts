import { StateCreator } from 'zustand';
import { LspStoreState } from '@/lib/stores/lsp-store/types';

/**
 * Interface for document-related state and operations
 */
export interface DocumentSlice {
  /**
   * State properties
   */
  currentFilePath: string | null;
  
  /**
   * Document action methods
   */
  setCurrentFile: (filePath: string | null, language: string | null) => void;
  openDocument: (filePath: string, language: string, content: string) => Promise<void>;
  updateDocument: (filePath: string, content: string, version: number) => Promise<void>;
  closeDocument: (filePath: string) => Promise<void>;
}

/**
 * Creator function for the document operations slice
 * @returns Document slice with state and actions for document operations
 */
export const createDocumentSlice: StateCreator<
  LspStoreState, 
  [], 
  [], 
  DocumentSlice
> = (set, get) => ({
  /**
   * State properties
   */
  currentFilePath: null,
  
  /**
   * Set the current file and language
   * @param filePath - Path of the current file or null
   * @param language - Language of the current file or null
   */
  setCurrentFile: (filePath, language) => {
    set({ 
      currentFilePath: filePath, 
      currentLanguage: language,
      diagnostics: [] 
    });
  },
  
  /**
   * Open a document in the language server
   * @param filePath - Path of the file to open
   * @param language - Language identifier of the file
   * @param content - Content of the file
   * @returns Promise that resolves when document is opened
   */
  openDocument: async (filePath: string, language: string, content: string) => {
    const { isServerRunning, webSocketClient, currentLanguage } = get();
    
    if (!isServerRunning || !webSocketClient) {
      throw new Error('LSP server is not running');
    }
    
    try {
      /**
       * Set loading state via UISlice
       */
      set({ isLoading: true });
      
      await webSocketClient.notifyDocumentOpened(filePath, language || currentLanguage || 'plaintext', content);
      set({ 
        currentFilePath: filePath, 
        currentLanguage: language || currentLanguage,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to open document:', error);
      set({ 
        error: `Failed to open document: ${error}`,
        isLoading: false
      });
    }
  },
  
  /**
   * Update a document's content in the language server
   * @param filePath - Path of the file to update
   * @param content - New content of the file
   * @param version - Version number of the document
   * @returns Promise that resolves when document is updated
   */
  updateDocument: async (filePath: string, content: string, version: number = 1) => {
    const { isServerRunning, webSocketClient, currentFilePath } = get();
    
    if (!isServerRunning || !webSocketClient) {
      return;
    }
    
    if (filePath !== currentFilePath) {
      console.warn('Trying to update document that is not currently active');
      return;
    }
    
    try {
      await webSocketClient.notifyDocumentChanged(filePath, content, version);
    } catch (error) {
      console.error('Failed to update document:', error);
      set({ error: `Failed to update document: ${error}` });
    }
  },
  
  /**
   * Close a document in the language server
   * @param filePath - Path of the file to close
   * @returns Promise that resolves when document is closed
   */
  closeDocument: async (filePath: string) => {
    const { isServerRunning, webSocketClient, currentFilePath } = get();
    
    if (!isServerRunning || !webSocketClient) {
      return;
    }
    
    try {
      await webSocketClient.notifyDocumentClosed(filePath);
      
      if (filePath === currentFilePath) {
        set({ currentFilePath: null, diagnostics: [] });
      }
    } catch (error) {
      console.error('Failed to close document:', error);
      set({ error: `Failed to close document: ${error}` });
    }
  }
});