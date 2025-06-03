import { create } from 'zustand';
import { createConnectionSlice, ConnectionSlice } from '@/lib/stores/lsp-store/connection-slice';
import { createDocumentSlice, DocumentSlice } from '@/lib/stores/lsp-store/document-slice';
import { createFeaturesSlice, FeaturesSlice } from '@/lib/stores/lsp-store/feature-slice';
import { createUISlice, UISlice } from '@/lib/stores/lsp-store/ui-slice';

/**
 * Create the main LSP store by combining all slices
 * @returns Combined store with all LSP functionality
 */
export const useLspStore = create<
  ConnectionSlice & DocumentSlice & FeaturesSlice & UISlice
>((...args) => ({
  ...createConnectionSlice(...args),
  ...createDocumentSlice(...args),
  ...createFeaturesSlice(...args),
  ...createUISlice(...args),
}));

/**
 * Cleanup handler for WebSocket connections when the window is closed
 * Automatically stops LSP WebSocket server on page unload
 */
window.addEventListener('beforeunload', () => {
  const { stopLspWebSocketServer, isWebSocketRunning } = useLspStore.getState();
  
  if (isWebSocketRunning) {
    stopLspWebSocketServer()
      .catch(error => console.error('Error shutting down WebSocket server:', error));
  }
});

/**
 * Re-export all types from types.ts for easier imports
 */
export type {
  CompletionItem,
  DiagnosticItem,
  EnhancedHoverData,
  DocumentationMetadata,
  ContentType,
  HoverInfo,
  Position,
  Location,
  TextEdit,
  LspRequest,
  LspResponse,
  LspStoreState
} from './types';

/**
 * Re-export slice interfaces from slice files
 */
export type { ConnectionSlice } from './connection-slice';
export type { DocumentSlice } from './document-slice';
export type { FeaturesSlice } from './feature-slice';
export type { UISlice } from './ui-slice';

/**
 * Re-export LspWebSocketClient interface for external use
 */
export type { LspWebSocketClient } from './connection-slice';