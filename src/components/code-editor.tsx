import { useEffect, useRef, useState } from "react"
import { EditorState, StateEffect } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { cn } from "@/lib/utils"
import { autocompletion, completionKeymap, CompletionContext } from "@codemirror/autocomplete"
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css"
import { python } from "@codemirror/lang-python"
import { json } from "@codemirror/lang-json"
import { xml } from "@codemirror/lang-xml"
import { markdown } from "@codemirror/lang-markdown"
import { sql } from "@codemirror/lang-sql"
import { rust } from "@codemirror/lang-rust"
import { cpp } from "@codemirror/lang-cpp"
import { java } from "@codemirror/lang-java"
import { php } from "@codemirror/lang-php"
import { sass } from "@codemirror/lang-sass"
import { less } from "@codemirror/lang-less"
import { yaml } from "@codemirror/lang-yaml"
import { indentWithTab } from "@codemirror/commands"
import { lintKeymap, linter, Diagnostic as CMDiagnostic } from "@codemirror/lint"
import { EditorView, keymap, hoverTooltip } from "@codemirror/view"
import { searchKeymap } from "@codemirror/search"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { ScrollArea } from "@/components/ui/scroll-area"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { lineNumbers, highlightActiveLineGutter } from "@codemirror/view"
import { bracketMatching, foldGutter } from "@codemirror/language"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"
import { useLspStore, DiagnosticItem, EnhancedHoverData, CompletionItem } from "@/lib/stores/lsp-store"
import { invoke } from "@tauri-apps/api/core"
import { EnhancedHoverTooltip } from "@/components/ui/hover-tooltip"
import { createPortal } from "react-dom"

const shadcnTheme = EditorView.theme({
  "&": {
    minHeight: "100vh",
    fontSize: "14px",
    backgroundColor: "#1B1B1E",
    color: "var(--muted-foreground)"
  },
  ".cm-scroller": {
    overflow: "auto",
    overscrollBehavior: "contain",
    minHeight: "100vh"
  },
  ".cm-content": {
    caretColor: "var(--primary)"
  },
  ".cm-cursor": {
    borderLeftColor: "var(--primary)",
    borderLeftWidth: "2px"
  },
  ".cm-activeLine": {
    backgroundColor: "var(--muted)"
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--muted)"
  },
  ".cm-line": {
    padding: "0 3px",
    lineHeight: "1.6",
    fontFamily: "'Geist Mono', monospace",
    color: "var(--muted-foreground)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--muted)"
  },
  ".cm-gutters": {
    minHeight: "100vh",
    backgroundColor: "var(--card)",
    color: "var(--muted-foreground)",
    border: "none",
    borderRight: "1px solid var(--border)"
  },
  ".cm-gutter": {
    minWidth: "3em",
    opacity: 0.8
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)"
  },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    "& > ul > li": {
      padding: "4px 8px"
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)"
    }
  }
}, { dark: true });

const shadcnHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--primary)", opacity: 0.9 },
  { tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic", opacity: 0.7 },
  { tag: t.string, color: "var(--chart-4)", opacity: 0.85 },
  { tag: t.number, color: "var(--chart-3)", opacity: 0.85 },
  { tag: t.operator, color: "var(--muted-foreground)", opacity: 0.9 },
  { tag: t.tagName, color: "var(--chart-1)", opacity: 0.85 },
  { tag: t.attributeName, color: "var(--chart-2)", opacity: 0.85 },
  { tag: t.className, color: "var(--chart-5)", opacity: 0.85 },
  { tag: t.propertyName, color: "var(--chart-2)", opacity: 0.85 },
  { tag: t.variableName, color: "var(--muted-foreground)", opacity: 0.9 },
  { tag: t.function(t.variableName), color: "var(--chart-1)", opacity: 0.85 },
  { tag: t.typeName, color: "var(--chart-5)", opacity: 0.85 },
  { tag: t.bool, color: "var(--chart-3)", opacity: 0.85 },
  { tag: t.definition(t.variableName), color: "var(--chart-5)", opacity: 0.85 },
  { tag: t.punctuation, color: "var(--muted-foreground)", opacity: 0.8 },
  { tag: t.heading, color: "var(--foreground)", fontWeight: "bold", opacity: 0.9 },
  { tag: t.link, color: "var(--primary)", textDecoration: "underline", opacity: 0.85 },
  { tag: t.emphasis, fontStyle: "italic", opacity: 0.85 },
  { tag: t.strong, fontWeight: "bold", opacity: 0.85 },
]);

export interface CodeEditorProps {
  initialValue: string
  onChange?: (content: string) => void
  language: string
  readOnly?: boolean
  onSave?: () => void
  className?: string
  filePath?: string
}


function mapLspDiagnosticsToCM(diagnostics: DiagnosticItem[]): CMDiagnostic[] {
  return diagnostics.map(diag => ({
    from: diag.range.start.character,
    to: diag.range.end.character,
    severity: diag.severity === 'error' ? 'error' : 
             diag.severity === 'warning' ? 'warning' : 'info',
    message: diag.message
  }));
}


function getCursorPosition(view: EditorView) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  
  return {
    line: line.number - 1, 
    character: pos - line.from 
  };
}

// Debug panel to show LSP data
function LspDebugPanel({ data }: { data: any }) {
  if (!data) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-96 overflow-auto rounded-md shadow-md p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">LSP Debug</h3>
        <button 
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            const debugElement = document.querySelector('[data-lsp-debug="true"]');
            if (debugElement) {
              debugElement.remove();
            }
          }}
        >
          Close
        </button>
      </div>
      <pre className="text-xs overflow-auto whitespace-pre-wrap text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// Typescript interface for debug data
interface LspDebugData {
  completionRequests: Array<any>;
  completionResponses: Array<any>;
  lastRequest: any;
  lastResponse: any;
  error: any;
}

// Global debug state for LSP
const lspDebugData: LspDebugData = {
  completionRequests: [],
  completionResponses: [],
  lastRequest: null,
  lastResponse: null,
  error: null
};

// Helper to show debug data in UI
function showLspDebugData() {
  let debugElement = document.querySelector('[data-lsp-debug="true"]');
  
  if (!debugElement) {
    debugElement = document.createElement('div');
    debugElement.setAttribute('data-lsp-debug', 'true');
    document.body.appendChild(debugElement);
  }
  
  const root = createPortal(
    <LspDebugPanel data={lspDebugData} />,
    debugElement as HTMLElement
  );
  
  // Using requestAnimationFrame to ensure the portal is rendered
  requestAnimationFrame(() => {
    // Force rendering
  });
}

const lspCompletion = (context: CompletionContext) => {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const lineStart = line.from;
  const lineEnd = line.to;
  const cursorPos = pos - lineStart;

  // Get LSP store state and functions
  const { getCompletions, currentFilePath } = useLspStore.getState();
  const filePath = useLspStore.getState().currentFilePath;
  
  // Debug: Log request information
  const requestInfo = {
    timestamp: new Date().toISOString(),
    filePath: filePath,
    lineNumber: line.number - 1,
    character: cursorPos,
    lineText: line.text,
    cursorPosition: pos,
  };
  
  console.log('[LSP Debug] Completion Request:', requestInfo);
  lspDebugData.lastRequest = requestInfo;
  lspDebugData.completionRequests.push(requestInfo);
  
  // Show debug panel
  showLspDebugData();
  
  // Check if we have a valid file path
  if (!filePath || filePath !== currentFilePath) {
    lspDebugData.error = 'No valid file path or mismatch with current file';
    showLspDebugData();
    console.warn('[LSP Debug] No valid file path or mismatch with current file');
    return null;
  }
  
  // Position in LSP format
  const lspPosition = {
    line: line.number - 1,
    character: cursorPos
  };
  
  // Call LSP completions
  return getCompletions(filePath, lspPosition)
    .then(completions => {
      // Debug: Log response
      const responseInfo = {
        timestamp: new Date().toISOString(),
        completionsCount: completions.length,
        completions: completions,
      };
      
      console.log('[LSP Debug] Completion Response:', responseInfo);
      lspDebugData.lastResponse = responseInfo;
      lspDebugData.completionResponses.push(responseInfo);
      lspDebugData.error = null;
      
      // Show updated debug data
      showLspDebugData();
      
      // Convert LSP completions to CodeMirror format
      const cmCompletions = completions.map(item => ({
        label: item.label,
        type: item.kind.toLowerCase(),
        detail: item.detail,
        info: item.documentation,
        apply: item.label
      }));
      
      // Find matching text before cursor
      const match = context.matchBefore(/[\w\d_\-\.]*/)
      const from = match ? lineStart + match.from : pos;
      
      return {
        from,
        options: cmCompletions,
        span: /^[\w\d_\-\.]*$/
      };
    })
    .catch(error => {
      // Debug: Log error
      const errorInfo = {
        timestamp: new Date().toISOString(),
        message: error.message || String(error),
        error: error
      };
      
      console.error('[LSP Debug] Completion Error:', errorInfo);
      lspDebugData.error = errorInfo;
      
      // Show error in debug data
      showLspDebugData();
      
      return null;
    });
};

const lspLinter = linter(view => {
  const { diagnostics, currentFilePath } = useLspStore.getState();
  const filePath = useLspStore.getState().currentFilePath;
  
  if (!filePath || filePath !== currentFilePath) {
    return [];
  }
  
  return mapLspDiagnosticsToCM(diagnostics);
});

export function CodeEditor({
  initialValue,
  onChange,
  language,
  readOnly = false,
  onSave,
  className,
  filePath,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [documentVersion, setDocumentVersion] = useState(1)
  
  
  const [hoverState, setHoverState] = useState<{
    data: EnhancedHoverData;
    pos: { top: number; left: number };
    isVisible: boolean;
  } | null>(null);

  const showHover = (data: EnhancedHoverData, pos: { top: number; left: number }) => {
    setHoverState({ data, pos, isVisible: true });
  };

  const hideHover = () => {
    setHoverState(null);
  };
  
  const { 
    startLspServer, 
    isWebSocketRunning, 
    isServerRunning, 
    openDocument, 
    updateDocument, 
    closeDocument 
  } = useLspStore();
  
  useEffect(() => {
    if (filePath && language && isWebSocketRunning) {

      const getProjectRoot = async (filePath: string, lang: string): Promise<string> => {
        try {
          const rootPath = await invoke('find_project_root', { filePath, language: lang });
          console.log(`Found project root: ${rootPath} for file: ${filePath}, language: ${lang}`);
          return rootPath as string;
        } catch (error) {
          console.error('Error finding project root:', error);
          
          return filePath.substring(0, filePath.lastIndexOf('/'));
        }
      };

      (async () => {
        try {
          const rootPath = await getProjectRoot(filePath, language);
          
          if (!isServerRunning) {
            await startLspServer(language, rootPath);
          }
          
          if (initialValue !== undefined) {
            await openDocument(filePath, language, initialValue);
            console.log(`Opened document: ${filePath}`);
          }
        } catch (err) {
          console.error(`Failed to initialize LSP for ${language}:`, err);
        }
      })();
    }
    
    return () => {
      if (filePath && isServerRunning) {
        closeDocument(filePath).catch(err => 
          console.error(`Error closing document ${filePath}:`, err)
        );
      }
    };
  }, [filePath, language, isWebSocketRunning, isServerRunning, startLspServer, openDocument, closeDocument, initialValue]);
  
  
  useEffect(() => {
    const handleNavigation = (event: CustomEvent<{ line: number; character: number }>) => {
      if (!viewRef.current) return;
      
      const { line, character } = event.detail;
      const doc = viewRef.current.state.doc;
      const targetLine = Math.min(doc.lines, line + 1);
      const lineStart = doc.line(targetLine).from;
      const lineLength = doc.line(targetLine).length;
      const pos = lineStart + Math.min(character, lineLength);

      const transaction = viewRef.current.state.update({
        selection: { anchor: pos, head: pos },
        scrollIntoView: true
      });
      
      viewRef.current.dispatch(transaction);
    };
    
    window.addEventListener('navigate-to-position', handleNavigation as EventListener);
    
    return () => {
      window.removeEventListener('navigate-to-position', handleNavigation as EventListener);
    };
  }, []);

  
  useEffect(() => {
    if (onChange && filePath && isServerRunning) {
      const handleChange = (content: string) => {
        setDocumentVersion(version => {
          const newVersion = version + 1;
          
          updateDocument(filePath, content, newVersion).catch(err => 
            console.error(`Error updating document ${filePath}:`, err)
          );
          return newVersion;
        });
        
        
        const editorContainer = document.querySelector('[data-editor-container]');
        if (editorContainer) {
          (editorContainer as any).__currentContent = content;
        }
        
        onChange(content);
      };
      
      if (editorView) {
        const changeListener = EditorView.updateListener.of(update => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            handleChange(content);
          }
        });
        
        editorView.dispatch({
          effects: StateEffect.appendConfig.of(changeListener)
        });
        
        return () => {
          editorView.dispatch({
            effects: StateEffect.reconfigure.of([])
          });
        };
      }
    }
  }, [editorView, onChange, filePath, isServerRunning, updateDocument]);

  
  const createLspHover = (view: EditorView, showHoverFn: typeof showHover) => {
    return hoverTooltip(async (view, pos) => {
      const { getHoverInfo, currentFilePath } = useLspStore.getState();
      
      if (!filePath || filePath !== currentFilePath) {
        return null;
      }
      
      const line = view.state.doc.lineAt(pos);
      const lspPosition = {
        line: line.number - 1,
        character: pos - line.from
      };
      
      const hoverInfo = await getHoverInfo(filePath, lspPosition);
      
      if (!hoverInfo || !hoverInfo.enhancedContents) {
        return null;
      }
      
      const posCoords = view.coordsAtPos(pos);
      if (posCoords && hoverInfo.enhancedContents) {
        setTimeout(() => {
          showHoverFn(hoverInfo.enhancedContents as EnhancedHoverData, {
            top: posCoords.top + 20,
            left: posCoords.left
          });
        }, 0);
      }
      
      return null;
    }, {
      hideOnChange: true,
      hoverTime: 300,
    });
  };

  
  useEffect(() => {
    
    hideHover();
    
    if (!editorRef.current) return;
    
    
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
      setEditorView(null);
    }
    
    
    
    const lspHoverExtension = createLspHover(
      new EditorView({state: EditorState.create({doc: ""})}), 
      showHover
    );
    
    
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        readOnly ? EditorState.readOnly.of(true) : [],
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        getLanguageExtension(language),
        bracketMatching(),
        closeBrackets(),
        autocompletion({
          override: [lspCompletion]
        }),
        lspLinter,
        lspHoverExtension,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...lintKeymap,
          ...searchKeymap,
          ...closeBracketsKeymap,
          indentWithTab
        ]),
        syntaxHighlighting(shadcnHighlightStyle),
        shadcnTheme,
        onChange ? EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        }) : [],
        onSave ? keymap.of([{
          key: "Mod-s",
          run: () => {
            onSave()
            return true
          }
        }]) : [],
      ]
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    setEditorView(view);
    
    
    const editorContainer = document.querySelector('[data-editor-container]');
    if (editorContainer) {
      (editorContainer as any).__currentContent = initialValue;
    }
    
    return () => {
      hideHover();
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [filePath, initialValue, language, readOnly, onChange, onSave]);
  
  function getLanguageExtension(lang: string) {
    switch (lang) {
      case "html": return html();
      case "css": return css();
      case "javascript": return javascript();
      case "typescript": return javascript({ typescript: true });
      case "jsx": return javascript({ jsx: true });
      case "tsx": return javascript({ jsx: true, typescript: true });
      case "json": return json();
      case "python": return python();
      case "java": return java();
      case "rust": return rust();
      case "cpp":
      case "c++":
      case "c": return cpp();
      case "php": return php();
      case "xml": return xml();
      case "markdown":
      case "md": return markdown();
      case "sql": return sql();
      case "sass": return sass();
      case "less": return less();
      case "yaml": return yaml();
      default: return javascript({ typescript: true });
    }
  }

  const renderHoverTooltip = () => {
    if (!hoverState?.isVisible) return null;
    
    return (
      <EnhancedHoverTooltip 
        data={hoverState.data}
        position={hoverState.pos}
        onClose={hideHover}
      />
    );
  };

  // Add keybinding to toggle debug panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+D to toggle debug panel
      if (e.altKey && e.key === 'd') {
        const debugElement = document.querySelector('[data-lsp-debug="true"]');
        if (debugElement) {
          debugElement.remove();
        } else {
          showLspDebugData();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className={cn("relative h-full w-full", className)} data-editor-container>
      <ScrollArea className="h-full w-full overscroll-none">
        <div className="relative h-full overscroll-none" ref={editorRef} />
      </ScrollArea>
      
      {hoverState?.isVisible && createPortal(
        renderHoverTooltip(),
        document.body
      )}
      
      {/* LSP Status Indicator */}
      <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs bg-background/80 px-2 py-1 rounded-md">
        <div 
          className={cn(
            "w-2 h-2 rounded-full", 
            isServerRunning ? "bg-green-500" : "bg-red-500"
          )} 
        />
        <span className="text-muted-foreground">{isServerRunning ? "LSP" : "No LSP"}</span>
        <button 
          className="text-primary text-xs hover:underline"
          onClick={() => showLspDebugData()}
        >
          Debug
        </button>
      </div>
    </div>
  )
}