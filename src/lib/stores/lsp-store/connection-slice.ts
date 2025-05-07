import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { LspStoreState, DiagnosticItem } from '@/lib/stores/lsp-store/types';

/**
 * Interface for WebSocket client that communicates with the LSP server
 */
export interface LspWebSocketClient {
  connect(): Promise<void>;
  initializeLanguageServer(language: string, rootPath: string): Promise<any>;
  sendRequest<T>(request: any): Promise<T>;
  notifyDocumentOpened(filePath: string, language: string, content: string): Promise<void>;
  notifyDocumentChanged(filePath: string, content: string, version: number): Promise<void>;
  notifyDocumentClosed(filePath: string): Promise<void>;
  sendNotification(method: string, params: any): Promise<void>;
  disconnectWebSocket(): void;
  registerNotificationHandler(method: string, handler: (params: any) => void): void;
  unregisterNotificationHandler(method: string): void;
  getServerCapabilities(): any;
  getServerInfo(): any;
  mapDiagnosticItems(items: any[]): any[];
}

/**
 * Implementation of the WebSocket client for LSP communication
 */
export class LspWebSocketClientImpl implements LspWebSocketClient {
  private socket: WebSocket | null = null;
  private requestCallbacks = new Map<string, (response: any) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;
  private isConnecting = false;
  private messageQueue: { request: any, resolve: (value: any) => void, reject: (reason: any) => void }[] = [];
  private connectionPromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private serverCapabilities: any = null;
  private serverInfo: any = null;
  private notificationHandlers = new Map<string, (params: any) => void>();

  /**
   * Create a new WebSocket client for LSP communication
   * @param url - WebSocket URL to connect to
   */
  constructor(private readonly url: string) {}

  /**
   * Get the server capabilities
   * @returns Server capabilities object or null
   */
  getServerCapabilities(): any {
    return this.serverCapabilities;
  }

  /**
   * Get the server info
   * @returns Server info object or null
   */
  getServerInfo(): any {
    return this.serverInfo;
  }

  /**
   * Connect to the WebSocket server
   * @returns Promise that resolves when connection is established
   */
  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          console.log('LSP WebSocket connected');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          
          while (this.messageQueue.length > 0) {
            const { request, resolve, reject } = this.messageQueue.shift()!;
            this.sendRequest(request)
              .then(resolve)
              .catch(reject);
          }
          
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);
            
            if (response.error) {
              console.error('LSP Error:', response.error.message);
            }
            
            if (response.id && this.requestCallbacks.has(response.id.toString())) {
              const callback = this.requestCallbacks.get(response.id.toString());
              this.requestCallbacks.delete(response.id.toString());
              
              if (callback) {
                callback(response);
              }
            } 
            else if (response.id && response.result && response.result.capabilities) {
              this.serverCapabilities = response.result.capabilities;
              this.serverInfo = response.result.serverInfo;
              console.log('LSP Server initialized with capabilities:', this.serverCapabilities);
              console.log('LSP Server info:', this.serverInfo);
            }
            else if (!response.id && response.method) {
              console.log(`Received LSP notification: ${response.method}`);
              
              if (response.method === 'textDocument/publishDiagnostics') {
                console.log(`Processing diagnostics notification with ${response.params?.diagnostics?.length || 0} items`);
                console.log('Diagnostics details:', JSON.stringify(response.params?.diagnostics, null, 2));
              }
              
              const handler = this.notificationHandlers.get(response.method);
              if (handler) {
                handler(response.params);
              } else {
                console.log(`No handler registered for notification method: ${response.method}`);
              }
            } else {
              console.log('Received unhandled LSP message:', response);
            }
          } catch (err) {
            console.error('Failed to parse LSP response:', err);
          }
        };

        this.socket.onerror = (error) => {
          console.error('LSP WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };

        this.socket.onclose = (event) => {
          console.log(`LSP WebSocket closed: code=${event.code}, reason=${event.reason}`);
          this.socket = null;
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectInterval);
          }
        };
      } catch (err) {
        this.isConnecting = false;
        reject(err);
      }
    });
    
    return this.connectionPromise;
  }
  

  /**
   * Initialize the language server for a specific language
   * @param language - Language identifier
   * @param rootPath - Root path of the project
   * @returns Promise that resolves with initialization result
   */
  async initializeLanguageServer(language: string, rootPath: string): Promise<any> {
    console.log(`Initializing LSP server for language: ${language}, rootPath: ${rootPath}`);
    
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    enum TextDocumentSyncKind {
      None = 0,
      Full = 1,
      Incremental = 2
    }
    
    const requestId = this.nextRequestId++;
    const initializeRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method: "initialize",
      params: {
        processId: null,
        rootUri: `file://${rootPath}`,
        initializationOptions: {
          language: language
        },
        capabilities: {
          textDocument: {
            synchronization: {
              didSave: true,
              dynamicRegistration: true,
              willSave: true,
              willSaveWaitUntil: true,
              didChange: TextDocumentSyncKind.Full,
            },
            completion: {
              dynamicRegistration: true,
              completionItem: {
                snippetSupport: true,
                documentationFormat: ["markdown", "plaintext"],
                deprecatedSupport: true,
                preselectSupport: true,
              }
            },
            hover: {
              dynamicRegistration: true,
              contentFormat: ["markdown", "plaintext"]
            },
            definition: {
              dynamicRegistration: true
            },
            references: {
              dynamicRegistration: true
            },
            documentHighlight: {
              dynamicRegistration: true
            },
            formatting: {
              dynamicRegistration: true
            },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: {
                valueSet: [1, 2]
              },
              versionSupport: true,
              codeDescriptionSupport: true,
              dataSupport: true
            }
          },
          workspace: {
            workspaceFolders: true,
            didChangeConfiguration: {
              dynamicRegistration: true
            }
          }
        },
        workspaceFolders: [
          {
            uri: `file://${rootPath}`,
            name: rootPath.split('/').pop() || ""
          }
        ],
        clientInfo: {
          name: "Horizon Editor",
          version: "0.1.0"
        }
      }
    };
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestCallbacks.delete(requestId.toString());
        reject(new Error('LSP initialize request timed out'));
      }, 10000);
      
      this.requestCallbacks.set(requestId.toString(), (response) => {
        clearTimeout(timeout);
        
        if (response.error) {
          reject(new Error(`LSP initialize error: ${response.error.message}`));
          return;
        }
        
        if (response.result?.capabilities) {
          this.serverCapabilities = response.result.capabilities;
          this.serverInfo = response.result.serverInfo;
          
          this.sendNotification("initialized", {});
          
          resolve({
            capabilities: this.serverCapabilities,
            serverInfo: this.serverInfo
          });
        } else {
          reject(new Error('Invalid initialize response: missing capabilities'));
        }
      });
      
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(initializeRequest));
      } else {
        clearTimeout(timeout);
        this.requestCallbacks.delete(requestId.toString());
        reject(new Error('WebSocket is not connected'));
      }
    });
  }

  /**
   * Send a notification to the language server
   * @param method - Method name
   * @param params - Parameters for the notification
   * @returns Promise that resolves when notification is sent
   */
  async sendNotification(method: string, params: any): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    
    const notification = {
      jsonrpc: "2.0",
      method,
      params
    };
    
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(notification));
    } else {
      throw new Error('WebSocket is not connected');
    }
  }

  /**
   * Send a request to the language server
   * @param request - Request object
   * @returns Promise that resolves with response
   */
  async sendRequest<T>(request: any): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (this.isConnecting) {
        return new Promise<T>((resolve, reject) => {
          this.messageQueue.push({ request, resolve, reject });
        });
      } else {
        try {
          await this.connect();
        } catch (error) {
          throw new Error(`Failed to connect to LSP server: ${error}`);
        }
      }
    }

    return new Promise<T>((resolve, reject) => {
      try {
        const requestId = this.nextRequestId++;
        
        const jsonRpcRequest = {
          jsonrpc: "2.0",
          id: requestId,
          method: this.mapRequestTypeToMethod(request.type),
          params: this.mapRequestPayloadToParams(request)
        };
        
        const timeout = setTimeout(() => {
          this.requestCallbacks.delete(requestId.toString());
          reject(new Error('LSP request timed out'));
        }, 5000);
        
        this.requestCallbacks.set(requestId.toString(), (response) => {
          clearTimeout(timeout);
          
          if (response.error) {
            reject(new Error(`LSP error: ${response.error.message}`));
            return;
          }
          
          const lspResponse = this.mapJsonRpcResponseToLspResponse(request.type, response.result);
          resolve(lspResponse as T);
        });
        
        this.socket?.send(JSON.stringify(jsonRpcRequest));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Notify the language server that a document has been opened
   * @param filePath - Path of the opened file
   * @param language - Language identifier of the file
   * @param content - Content of the file
   * @returns Promise that resolves when notification is sent
   */
  notifyDocumentOpened(filePath: string, language: string, content: string): Promise<void> {
    return this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: `file://${filePath}`,
        languageId: language,
        version: 1,
        text: content
      }
    });
  }
  
  /**
   * Notify the language server that a document has been changed
   * @param filePath - Path of the changed file
   * @param content - New content of the file
   * @param version - Version number of the document
   * @returns Promise that resolves when notification is sent
   */
  notifyDocumentChanged(filePath: string, content: string, version: number): Promise<void> {
    console.log(`Notifying LSP server about document change: ${filePath} (version ${version}, content length: ${content.length})`);
    return this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri: `file://${filePath}`,
        version: version
      },
      contentChanges: [
        { text: content }
      ]
    });
  }
  
  /**
   * Notify the language server that a document has been closed
   * @param filePath - Path of the closed file
   * @returns Promise that resolves when notification is sent
   */
  notifyDocumentClosed(filePath: string): Promise<void> {
    return this.sendNotification("textDocument/didClose", {
      textDocument: {
        uri: `file://${filePath}`
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnectWebSocket() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Register a handler for a specific notification method
   * @param method - Notification method to handle
   * @param handler - Handler function
   */
  registerNotificationHandler(method: string, handler: (params: any) => void): void {
    console.log(`Registering notification handler for ${method}`);
    this.notificationHandlers.set(method, handler);
  }

  /**
   * Unregister a handler for a specific notification method
   * @param method - Notification method to unregister
   */
  unregisterNotificationHandler(method: string): void {
    console.log(`Unregistering notification handler for ${method}`);
    this.notificationHandlers.delete(method);
  }

  /**
   * Map diagnostic items from LSP format to app format
   * @param items - Diagnostic items in LSP format
   * @returns Mapped diagnostic items
   */
  mapDiagnosticItems(items: any[]): any[] {
    return items.map(item => ({
      message: item.message || 'No message provided',
      severity: this.mapDiagnosticSeverity(item.severity),
      range: {
        start: {
          line: item.range?.start?.line || 0,
          character: item.range?.start?.character || 0
        },
        end: {
          line: item.range?.end?.line || 0,
          character: item.range?.end?.character || 0
        }
      }
    }));
  }

  // Private helper methods
  private mapRequestTypeToMethod(type: string): string {
    switch (type) {
      case 'Initialize': return 'initialize';
      case 'Completion': return 'textDocument/completion';
      case 'Hover': return 'textDocument/hover';
      case 'Definition': return 'textDocument/definition';
      case 'References': return 'textDocument/references';
      case 'Formatting': return 'textDocument/formatting';
      default: throw new Error(`Unknown request type: ${type}`);
    }
  }
  
  private mapRequestPayloadToParams(request: any): any {
    if (request.type === 'Initialize') {
      const { language, root_path } = request.payload as any;
      return {
        processId: null,
        rootUri: `file://${root_path}`,
        initializationOptions: {
          language
        },
        capabilities: {
          textDocument: {
            synchronization: {
              didSave: true,
              didChange: 1 // TextDocumentSyncKind.Full
            },
            completion: {
              completionItem: {
                snippetSupport: true,
                documentationFormat: ["markdown", "plaintext"]
              }
            },
            hover: {
              contentFormat: ["markdown", "plaintext"]
            },
            publishDiagnostics: {
              relatedInformation: true
            }
          }
        }
      };
    }
    
    if (request.type === 'Completion') {
      const completionPayload = request.payload as any;
      return {
        textDocument: {
          uri: `file://${completionPayload.file_path}`
        },
        position: {
          line: completionPayload.position.line,
          character: completionPayload.position.character
        }
      };
    }
    
    if (request.type === 'Hover') {
      const hoverPayload = request.payload as any;
      return {
        textDocument: {
          uri: `file://${hoverPayload.file_path}`
        },
        position: {
          line: hoverPayload.position.line,
          character: hoverPayload.position.character
        }
      };
    }
    
    if (request.type === 'Definition') {
      const definitionPayload = request.payload as any;
      return {
        textDocument: {
          uri: `file://${definitionPayload.file_path}`
        },
        position: {
          line: definitionPayload.position.line,
          character: definitionPayload.position.character
        }
      };
    }
    
    if (request.type === 'References') {
      const referencesPayload = request.payload as any;
      return {
        textDocument: {
          uri: `file://${referencesPayload.file_path}`
        },
        position: {
          line: referencesPayload.position.line,
          character: referencesPayload.position.character
        },
        context: {
          includeDeclaration: true
        }
      };
    }
    
    if (request.type === 'Formatting') {
      const formattingPayload = request.payload as any;
      return {
        textDocument: {
          uri: `file://${formattingPayload.file_path}`
        },
        options: {
          tabSize: 2,
          insertSpaces: true
        }
      };
    }
    
    throw new Error(`Unknown request type: ${(request as any).type}`);
  }
  
  private mapJsonRpcResponseToLspResponse(requestType: string, result: any): any {
    switch (requestType) {
      case 'Initialize':
        return {
          type: 'Initialized',
          payload: {
            success: true,
            message: 'Server initialized successfully'
          }
        };
      
      case 'Completion':
        return {
          type: 'Completion',
          payload: {
            items: this.mapCompletionItems(result?.items || [])
          }
        };
      
      case 'Hover':
        return {
          type: 'Hover',
          payload: {
            contents: this.extractHoverContents(result)
          }
        };
      
      case 'Definition':
        return {
          type: 'Definition',
          payload: {
            location: this.mapLocation(result)
          }
        };
      
      case 'References':
        const locations = Array.isArray(result) 
          ? result.map(this.mapLocation).filter((loc): loc is any => loc !== null) 
          : [];
        
        return {
          type: 'References',
          payload: { locations }
        };
      
      case 'Formatting':
        return {
          type: 'Formatting',
          payload: {
            edits: this.mapTextEdits(result || [])
          }
        };
      
      default:
        return {
          type: 'Error',
          payload: {
            message: `Unknown response type for request: ${requestType}`
          }
        };
    }
  }
  
  private mapCompletionItems(items: any[]): any[] {
    return items.map(item => ({
      label: item.label,
      kind: this.mapCompletionItemKind(item.kind),
      detail: item.detail || '',
      documentation: item.documentation?.value || item.documentation || ''
    }));
  }
  
  private mapCompletionItemKind(kind: number): string {
    const kinds: Record<number, string> = {
      1: 'text',
      2: 'method',
      3: 'function',
      4: 'constructor',
      5: 'field',
      6: 'variable',
      7: 'class',
      8: 'interface',
      9: 'module',
      10: 'property',
      11: 'unit',
      12: 'value',
      13: 'enum',
      14: 'keyword',
      15: 'snippet',
      16: 'color',
      17: 'file',
      18: 'reference',
      19: 'folder',
      20: 'enumMember',
      21: 'constant',
      22: 'struct',
      23: 'event',
      24: 'operator',
      25: 'typeParameter'
    };
    
    return kinds[kind] || 'text';
  }
  
  private extractHoverContents(hover: any): string | null {
    if (!hover) return null;
    
    const contents = hover.contents;
    if (!contents) return null;
    
    if (typeof contents === 'string') return contents;
    if (contents.value) return contents.value;
    
    if (Array.isArray(contents)) {
      return contents
        .map(c => typeof c === 'string' ? c : c.value || '')
        .filter(Boolean)
        .join('\n\n');
    }
    
    if (contents.kind === 'markdown' || contents.kind === 'plaintext') {
      return contents.value;
    }
    
    return null;
  }
  
  private mapLocation(location: any): any | null {
    if (!location) return null;
    
    try {
      const uri = location.uri;
      if (!uri) return null;
      
      const filePath = uri.startsWith('file://') 
        ? uri.substring(7) 
        : uri;
      
      return {
        file_path: filePath,
        range: {
          start: {
            line: location.range.start.line,
            character: location.range.start.character
          },
          end: {
            line: location.range.end.line,
            character: location.range.end.character
          }
        }
      };
    } catch (e) {
      console.error('Error mapping location:', e, location);
      return null;
    }
  }
  
  private mapTextEdits(edits: any[]): any[] {
    return edits.map(edit => ({
      range: {
        start: {
          line: edit.range.start.line,
          character: edit.range.start.character
        },
        end: {
          line: edit.range.end.line,
          character: edit.range.end.character
        }
      },
      newText: edit.newText
    }));
  }
  
  private mapDiagnosticSeverity(severity: number): 'error' | 'warning' | 'information' | 'hint' {
    switch (severity) {
      case 1: return 'error';
      case 2: return 'warning';
      case 3: return 'information';
      case 4: return 'hint';
      default: return 'information';
    }
  }
}

/**
 * Interface for connection-related state and operations
 */
export interface ConnectionSlice {
  /**
   * State properties
   */
  isServerRunning: boolean;
  isWebSocketRunning: boolean;
  webSocketClient: LspWebSocketClient | null;
  currentLanguage: string | null;
  rootPath: string | null;
  filesDiagnostics: Record<string, DiagnosticItem[]>;
  
  /**
   * Connection action methods
   */
  startLspWebSocketServer: (port: number) => Promise<void>;
  stopLspWebSocketServer: () => Promise<void>;
  startLspServer: (language: string, rootPath: string) => Promise<void>;
  connectToWebSocket: (url: string) => Promise<void>;
  disconnectWebSocket: () => void;
}

/**
 * Creator function for the connection operations slice
 * @returns Connection slice with state and actions for connection operations
 */
export const createConnectionSlice: StateCreator<
  LspStoreState, 
  [], 
  [], 
  ConnectionSlice
> = (set, get) => ({
  /**
   * State properties
   */
  isServerRunning: false,
  isWebSocketRunning: false,
  webSocketClient: null,
  currentLanguage: null,
  rootPath: null,
  filesDiagnostics: {},
  
  /**
   * Start the LSP WebSocket server
   * @param port - Port to run the server on
   * @returns Promise that resolves when server is started
   */
  startLspWebSocketServer: async (port) => {
    set({ isLoading: true, error: null });
    try {
      const isRunning = await invoke<boolean>('is_lsp_websocket_running');
      if (isRunning) {
        console.log(`LSP WebSocket server is already running on port ${port}`);
        
        set({
          isWebSocketRunning: true,
          isLoading: false
        });
        
        await get().connectToWebSocket(`ws://localhost:${port}/lsp`);
        return;
      }
      
      console.log(`Starting LSP WebSocket server on port ${port}...`);
      const result = await invoke<string>('start_lsp_websocket_server', { port });
      console.log(`Server response: ${result}`);
      
      if (result.includes('already running') || result.includes('Starting LSP WebSocket server')) {
        set({ 
          isWebSocketRunning: true,
          isLoading: false 
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          await get().connectToWebSocket(`ws://localhost:${port}/lsp`);
        } catch (connectError) {
          console.log(`Failed to connect on port ${port}, trying ${port + 1}...`);
          try {
            await get().connectToWebSocket(`ws://localhost:${port + 1}/lsp`);
          } catch (nextPortError) {
            console.error('Failed to connect to WebSocket on fallback port:', nextPortError);
            throw nextPortError;
          }
        }
      } else {
        throw new Error(`Unexpected server response: ${result}`);
      }
    } catch (error) {
      set({ 
        error: `Failed to start LSP WebSocket server: ${error}`, 
        isLoading: false 
      });
    }
  },
  
  /**
   * Stop the LSP WebSocket server
   * @returns Promise that resolves when server is stopped
   */
  stopLspWebSocketServer: async () => {
    set({ isLoading: true, error: null });
    
    get().disconnectWebSocket();
    
    try {
      await invoke('stop_lsp_websocket_server');
      
      set({ 
        isWebSocketRunning: false,
        isServerRunning: false,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        error: `Failed to stop LSP WebSocket server: ${error}`, 
        isLoading: false 
      });
    }
  },
  
  /**
   * Start the LSP server for a specific language
   * @param language - Language identifier
   * @param rootPath - Root path of the project
   * @returns Promise that resolves when server is started
   */
  startLspServer: async (language: string, rootPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const { isWebSocketRunning, webSocketClient } = get();
      
      if (!isWebSocketRunning || !webSocketClient) {
        throw new Error('WebSocket server is not running. Initialize it first.');
      }
      
      console.log(`Starting LSP server for language: ${language}, rootPath: ${rootPath}`);
      
      const result = await webSocketClient.initializeLanguageServer(language, rootPath);
      
      console.log('LSP server initialized with result:', result);
      
      set({ 
        isServerRunning: true,
        currentLanguage: language,
        rootPath,
        isLoading: false 
      });
      
      return result;
    } catch (error) {
      set({ 
        error: `Failed to start LSP server: ${error}`, 
        isLoading: false 
      });
      
      throw error;
    }
  },
  
  /**
   * Connect to a WebSocket server
   * @param url - WebSocket URL to connect to
   * @returns Promise that resolves when connection is established
   */
  connectToWebSocket: async (url) => {
    try {
      const client = new LspWebSocketClientImpl(url);
      await client.connect();
      
      client.registerNotificationHandler('textDocument/publishDiagnostics', (params) => {
        console.log('Received publishDiagnostics notification', params);
        
        if (!params || !params.uri || !Array.isArray(params.diagnostics)) {
          console.error('Invalid diagnostics format received:', params);
          return;
        }
        
        const filePath = params.uri.startsWith('file://') 
          ? params.uri.substring(7) 
          : params.uri;
        
        const diagnosticItems = client.mapDiagnosticItems(params.diagnostics);
        
        console.log(`Processed ${diagnosticItems.length} diagnostics for ${filePath}`);
        
        const { currentFilePath, filesDiagnostics } = get();
        
        // Store diagnostics by file path
        const updatedFilesDiagnostics = {
          ...filesDiagnostics,
          [filePath]: diagnosticItems
        };
        
        // Update the diagnostics for the current file and the filesDiagnostics map
        if (currentFilePath === filePath) {
          set({ 
            diagnostics: diagnosticItems,
            filesDiagnostics: updatedFilesDiagnostics
          });
          console.log('Updated diagnostics in store for current file');
        } else {
          set({ filesDiagnostics: updatedFilesDiagnostics });
          console.log(`Stored diagnostics for ${filePath}, current file is ${currentFilePath}`);
        }
      });
      
      client.registerNotificationHandler('window/showMessage', (params) => {
        console.log('Received showMessage notification', params);
        
        if (params && params.type && params.message) {
          const messageType = (() => {
            switch (params.type) {
              case 1: return 'Error';
              case 2: return 'Warning';
              case 3: return 'Info';
              case 4: return 'Log';
              default: return 'Info';
            }
          })();
          
          console.log(`LSP ${messageType}: ${params.message}`);
        }
      });
      
      set({ webSocketClient: client, isWebSocketRunning: true });
      return;
    } catch (error) {
      set({ error: `Failed to connect to WebSocket: ${error}` });
      throw error;
    }
  },
  
  /**
   * Disconnect from the WebSocket server
   */
  disconnectWebSocket: () => {
    const webSocketClient = get().webSocketClient;
    if (webSocketClient) {
      webSocketClient.disconnectWebSocket();
      set({ webSocketClient: null, isWebSocketRunning: false });
    }
  }
});