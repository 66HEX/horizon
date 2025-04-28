import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { FormattedHoverData } from "@/components/ui/hover-tooltip";

export type CompletionItem = {
  label: string;
  kind: string;
  detail?: string;
  documentation?: string;
};

export type DiagnosticItem = {
  message: string;
  severity: 'error' | 'warning' | 'information' | 'hint';
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

export type HoverInfo = {
  contents: string;
  formattedContents?: FormattedHoverData;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

export type Position = {
  line: number;
  character: number;
};

export type Location = {
  file_path: string;
  range: {
    start: Position;
    end: Position;
  };
};

export type TextEdit = {
  range: {
    start: Position;
    end: Position;
  };
  newText: string;
};

enum TextDocumentSyncKind {
  None = 0,
  Full = 1,
  Incremental = 2
}

export type LspRequest = 
  | { type: 'Initialize', payload: { language: string, root_path: string } }
  | { type: 'Completion', payload: { file_path: string, position: Position } }
  | { type: 'Hover', payload: { file_path: string, position: Position } }
  | { type: 'Definition', payload: { file_path: string, position: Position } }
  | { type: 'References', payload: { file_path: string, position: Position } }
  | { type: 'Formatting', payload: { file_path: string } };

export type LspResponse = 
  | { type: 'Initialized', payload: { success: boolean, message: string } }
  | { type: 'Completion', payload: { items: CompletionItem[] } }
  | { type: 'Hover', payload: { contents: string | null } }
  | { type: 'Definition', payload: { location: Location | null } }
  | { type: 'References', payload: { locations: Location[] } }
  | { type: 'Formatting', payload: { edits: TextEdit[] } }
  | { type: 'Error', payload: { message: string } };

class LspWebSocketClient {
  private socket: WebSocket | null = null;
  private requestCallbacks = new Map<string, (response: any) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;
  private isConnecting = false;
  private messageQueue: { request: LspRequest, resolve: (value: any) => void, reject: (reason: any) => void }[] = [];
  private connectionPromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private serverCapabilities: any = null;
  private serverInfo: any = null;
  private notificationHandlers = new Map<string, (params: any) => void>();

  constructor(private readonly url: string) {}

  getServerCapabilities(): any {
    return this.serverCapabilities;
  }

  getServerInfo(): any {
    return this.serverInfo;
  }

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
              console.log(`Otrzymano powiadomienie LSP: ${response.method}`);
              
              if (response.method === 'textDocument/publishDiagnostics') {
                console.log(`Processing diagnostics notification with ${response.params?.diagnostics?.length || 0} items`);
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

  async initializeLanguageServer(language: string, rootPath: string): Promise<any> {
    console.log(`Initializing LSP server for language: ${language}, rootPath: ${rootPath}`);
    
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.connect();
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
  
  async notifyDocumentOpened(filePath: string, language: string, content: string): Promise<void> {
    return this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: `file://${filePath}`,
        languageId: language,
        version: 1,
        text: content
      }
    });
  }
  
  async notifyDocumentChanged(filePath: string, content: string, version: number): Promise<void> {
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
  
  async notifyDocumentClosed(filePath: string): Promise<void> {
    return this.sendNotification("textDocument/didClose", {
      textDocument: {
        uri: `file://${filePath}`
      }
    });
  }
  
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

  async sendRequest<T extends LspResponse>(request: LspRequest): Promise<T> {
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
  
  private mapRequestTypeToMethod(type: LspRequest["type"]): string {
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
  
  private mapRequestPayloadToParams(request: LspRequest): any {
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
              didChange: TextDocumentSyncKind.Full
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
  
  private mapJsonRpcResponseToLspResponse(requestType: string, result: any): LspResponse {
    switch (requestType) {
      case 'Initialize':
        const initResponse: { type: 'Initialized', payload: { success: boolean, message: string } } = {
          type: 'Initialized',
          payload: {
            success: true,
            message: 'Server initialized successfully'
          }
        };
        return initResponse;
      
      case 'Completion':
        const completionResponse: { type: 'Completion', payload: { items: CompletionItem[] } } = {
          type: 'Completion',
          payload: {
            items: this.mapCompletionItems(result?.items || [])
          }
        };
        return completionResponse;
      
      case 'Hover':
        const hoverResponse: { type: 'Hover', payload: { contents: string | null } } = {
          type: 'Hover',
          payload: {
            contents: this.extractHoverContents(result)
          }
        };
        return hoverResponse;
      
      case 'Definition':
        const definitionResponse: { type: 'Definition', payload: { location: Location | null } } = {
          type: 'Definition',
          payload: {
            location: this.mapLocation(result)
          }
        };
        return definitionResponse;
      
      case 'References':
        const locations = Array.isArray(result) 
          ? result.map(this.mapLocation).filter((loc): loc is Location => loc !== null) 
          : [];
        
        const referencesResponse: { type: 'References', payload: { locations: Location[] } } = {
          type: 'References',
          payload: { locations }
        };
        return referencesResponse;
      
      case 'Formatting':
        const formattingResponse: { type: 'Formatting', payload: { edits: TextEdit[] } } = {
          type: 'Formatting',
          payload: {
            edits: this.mapTextEdits(result || [])
          }
        };
        return formattingResponse;
      
      default:
        const errorResponse: { type: 'Error', payload: { message: string } } = {
          type: 'Error',
          payload: {
            message: `Unknown response type for request: ${requestType}`
          }
        };
        return errorResponse;
    }
  }
  
  
  private mapCompletionItems(items: any[]): CompletionItem[] {
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
  
  private mapLocation(location: any): Location | null {
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
  
  private mapTextEdits(edits: any[]): TextEdit[] {
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

  mapDiagnosticItems(items: any[]): DiagnosticItem[] {
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
  
  private mapDiagnosticSeverity(severity: number): 'error' | 'warning' | 'information' | 'hint' {
    switch (severity) {
      case 1: return 'error';
      case 2: return 'warning';
      case 3: return 'information';
      case 4: return 'hint';
      default: return 'information';
    }
  }

  disconnectWebSocket() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  registerNotificationHandler(method: string, handler: (params: any) => void): void {
    console.log(`Registering notification handler for ${method}`);
    this.notificationHandlers.set(method, handler);
  }

  unregisterNotificationHandler(method: string): void {
    console.log(`Unregistering notification handler for ${method}`);
    this.notificationHandlers.delete(method);
  }
}

interface LspState {
  isServerRunning: boolean;
  isWebSocketRunning: boolean;
  webSocketClient: LspWebSocketClient | null;
  currentLanguage: string | null;
  currentFilePath: string | null;
  rootPath: string | null;
  completions: CompletionItem[];
  diagnostics: DiagnosticItem[];
  isLoading: boolean;
  error: string | null;
  
  startLspWebSocketServer: (port: number) => Promise<void>;
  stopLspWebSocketServer: () => Promise<void>;
  startLspServer: (language: string, rootPath: string) => Promise<void>;
  connectToWebSocket: (url: string) => Promise<void>;
  disconnectWebSocket: () => void;
  getCompletions: (filePath: string, position: Position) => Promise<CompletionItem[]>;
  getDiagnostics: (filePath: string) => Promise<DiagnosticItem[]>;
  getHoverInfo: (filePath: string, position: Position) => Promise<HoverInfo | null>;
  gotoDefinition: (filePath: string, position: Position) => Promise<Location | null>;
  setCurrentFile: (filePath: string | null, language: string | null) => void;
  openDocument: (filePath: string, language: string, content: string) => Promise<void>;
  updateDocument: (filePath: string, content: string, version: number) => Promise<void>;
  closeDocument: (filePath: string) => Promise<void>;
  formatDocument: (filePath: string) => Promise<TextEdit[]>;
}

export const useLspStore = create<LspState>((set, get) => ({
  isServerRunning: false,
  isWebSocketRunning: false,
  webSocketClient: null,
  currentLanguage: null,
  currentFilePath: null,
  rootPath: null,
  completions: [],
  diagnostics: [],
  isLoading: false,
  error: null,
  
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
  
  connectToWebSocket: async (url) => {
    try {
      const client = new LspWebSocketClient(url);
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
        
        const { currentFilePath } = get();
        if (currentFilePath === filePath) {
          set({ diagnostics: diagnosticItems });
          console.log('Updated diagnostics in store');
        } else {
          console.log(`Ignoring diagnostics for ${filePath}, current file is ${currentFilePath}`);
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
  
  disconnectWebSocket: () => {
    const webSocketClient = get().webSocketClient;
    if (webSocketClient) {
      webSocketClient.disconnectWebSocket();
      set({ webSocketClient: null, isWebSocketRunning: false });
    }
  },
  
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
  
  getDiagnostics: async (filePath) => {
    const { isServerRunning, currentLanguage, webSocketClient, diagnostics } = get();
    
    if (!isServerRunning || !currentLanguage || !webSocketClient) {
      return [];
    }
    
    return diagnostics;
  },
  
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
          const formattedData = await invoke<FormattedHoverData>('format_hover_data', { 
            contents: response.payload.contents 
          });
          
          return { 
            contents: response.payload.contents,
            formattedContents: formattedData
          };
        } catch (formattingError) {
          console.error('Błąd podczas formatowania hover:', formattingError);
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
  
  setCurrentFile: (filePath, language) => {
    set({ 
      currentFilePath: filePath, 
      currentLanguage: language,
      diagnostics: [] 
    });
  },
  
  openDocument: async (filePath: string, language: string, content: string) => {
    const { isServerRunning, webSocketClient, currentLanguage } = get();
    
    if (!isServerRunning || !webSocketClient) {
      throw new Error('LSP server is not running');
    }
    
    try {
      await webSocketClient.notifyDocumentOpened(filePath, language || currentLanguage || 'plaintext', content);
      set({ currentFilePath: filePath, currentLanguage: language || currentLanguage });
      
    } catch (error) {
      console.error('Failed to open document:', error);
      set({ error: `Failed to open document: ${error}` });
    }
  },
  
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
    }
  },
  
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
    }
  },
  
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
}));

window.addEventListener('beforeunload', () => {
  const { stopLspWebSocketServer, isWebSocketRunning } = useLspStore.getState();
  
  if (isWebSocketRunning) {
    stopLspWebSocketServer()
      .catch(error => console.error('Error shutting down WebSocket server:', error));
  }
}); 