import { LspWebSocketClient } from './connection-slice';

/**
 * Core types for LSP operations
 */

/**
 * Completion item returned from language server
 */
export type CompletionItem = {
  label: string;
  kind: string;
  detail?: string;
  documentation?: string;
};

/**
 * Diagnostic message information
 */
export type DiagnosticItem = {
  message: string;
  severity: 'error' | 'warning' | 'information' | 'hint';
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

/**
 * Enhanced hover data with additional formatting
 */
export type EnhancedHoverData = {
  title: string;
  signature: string | null;
  documentation: string | null;
  source_code: string | null;
  raw: string;
  metadata: DocumentationMetadata;
};

/**
 * UI-specific hover data structure
 */
export type UIEnhancedHoverData = {
  title: string;
  signature: string | null;
  documentation: string | null;
  source_code: string | null;
  raw: string;
};

/**
 * Metadata about documentation content
 */
export type DocumentationMetadata = {
  has_code_blocks: boolean;
  has_tables: boolean;
  has_lists: boolean;
  content_type: ContentType;
  warning_messages: string[];
};

/**
 * Types of content that can be documented
 */
export type ContentType = 'function' | 'struct' | 'variable' | 'module' | 'generic';

/**
 * Hover information returned from language server
 */
export type HoverInfo = {
  contents: string;
  enhancedContents?: UIEnhancedHoverData;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

/**
 * Position in a text document
 */
export type Position = {
  line: number;
  character: number;
};

/**
 * Location information in a file
 */
export type Location = {
  file_path: string;
  range: {
    start: Position;
    end: Position;
  };
};

/**
 * Text edit operation
 */
export type TextEdit = {
  range: {
    start: Position;
    end: Position;
  };
  newText: string;
};

/**
 * Request types for LSP communication
 */
export type LspRequest = 
  | { type: 'Initialize', payload: { language: string, root_path: string } }
  | { type: 'Completion', payload: { file_path: string, position: Position } }
  | { type: 'Hover', payload: { file_path: string, position: Position } }
  | { type: 'Definition', payload: { file_path: string, position: Position } }
  | { type: 'References', payload: { file_path: string, position: Position } }
  | { type: 'Formatting', payload: { file_path: string } };

/**
 * Response types from LSP server
 */
export type LspResponse = 
  | { type: 'Initialized', payload: { success: boolean, message: string } }
  | { type: 'Completion', payload: { items: CompletionItem[] } }
  | { type: 'Hover', payload: { contents: string | null } }
  | { type: 'Definition', payload: { location: Location | null } }
  | { type: 'References', payload: { locations: Location[] } }
  | { type: 'Formatting', payload: { edits: TextEdit[] } }
  | { type: 'Error', payload: { message: string } };

/**
 * Combined interface for the entire LSP store
 */
export interface LspStoreState {
  /**
   * Connection slice state properties
   */
  isServerRunning: boolean;
  isWebSocketRunning: boolean;
  webSocketClient: LspWebSocketClient | null;
  currentLanguage: string | null;
  rootPath: string | null;
  
  /**
   * Document slice state properties
   */
  currentFilePath: string | null;
  
  /**
   * Features slice state properties
   */
  completions: CompletionItem[];
  diagnostics: DiagnosticItem[];
  
  /**
   * UI slice state properties
   */
  isLoading: boolean;
  error: string | null;
  
  /**
   * Connection slice methods
   */
  startLspWebSocketServer: (port: number) => Promise<void>;
  stopLspWebSocketServer: () => Promise<void>;
  startLspServer: (language: string, rootPath: string) => Promise<void>;
  connectToWebSocket: (url: string) => Promise<void>;
  disconnectWebSocket: () => void;
  
  /**
   * Document slice methods
   */
  setCurrentFile: (filePath: string | null, language: string | null) => void;
  openDocument: (filePath: string, language: string, content: string) => Promise<void>;
  updateDocument: (filePath: string, content: string, version: number) => Promise<void>;
  closeDocument: (filePath: string) => Promise<void>;
  
  /**
   * Features slice methods
   */
  getCompletions: (filePath: string, position: Position) => Promise<CompletionItem[]>;
  getDiagnostics: (filePath: string) => Promise<DiagnosticItem[]>;
  getHoverInfo: (filePath: string, position: Position) => Promise<HoverInfo | null>;
  gotoDefinition: (filePath: string, position: Position) => Promise<Location | null>;
  formatDocument: (filePath: string) => Promise<TextEdit[]>;
  
  /**
   * UI slice methods
   */
  setLoading?: (loading: boolean) => void;
  setError?: (error: string | null) => void;
  clearError?: () => void;
}