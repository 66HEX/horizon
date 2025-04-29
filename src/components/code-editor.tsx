"use client"

import { useEffect, useRef } from "react"
import { EditorState, StateEffect } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { cn } from "@/lib/utils"
import { autocompletion, completionKeymap, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
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
import { EditorView, keymap, hoverTooltip, Tooltip } from "@codemirror/view"
import { searchKeymap } from "@codemirror/search"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { ScrollArea } from "./ui/scroll-area"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { lineNumbers, highlightActiveLineGutter } from "@codemirror/view"
import { bracketMatching, foldGutter } from "@codemirror/language"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"
import { useLspStore, CompletionItem as LspCompletionItem, DiagnosticItem } from "@/lib/lsp-store"
import { invoke } from "@tauri-apps/api/core"
import { HoverTooltip } from "./ui/hover-tooltip"
import { createPortal } from "react-dom"
import React from "react"

const shadcnTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)"
  },
  ".cm-scroller": {
    overflow: "auto",
    overscrollBehavior: "contain"
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

// Funkcja mapująca diagnostykę LSP na diagnostykę CodeMirror
function mapLspDiagnosticsToCM(diagnostics: DiagnosticItem[]): CMDiagnostic[] {
  return diagnostics.map(diag => ({
    from: diag.range.start.character,
    to: diag.range.end.character,
    severity: diag.severity === 'error' ? 'error' : 
             diag.severity === 'warning' ? 'warning' : 'info',
    message: diag.message
  }));
}

// Konwertuje pozycję kursora do formatu używanego przez LSP
function getCursorPosition(view: EditorView) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  
  return {
    line: line.number - 1, // LSP używa 0-bazowanego indeksowania linii
    character: pos - line.from // Pozycja znaku w linii
  };
}

// LSP wsparcie - funkcja autouzupełniania
const lspCompletion = (context: CompletionContext) => {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const lineStart = line.from;
  const lineEnd = line.to;
  const cursorPos = pos - lineStart;

  // Pobierz serwis LSP
  const { getCompletions, currentFilePath } = useLspStore.getState();
  const filePath = useLspStore.getState().currentFilePath;
  
  // Sprawdź, czy jesteśmy w prawidłowym pliku
  if (!filePath || filePath !== currentFilePath) {
    return null;
  }
  
  // Pobierz pozycję kursora w formacie LSP
  const lspPosition = {
    line: line.number - 1,
    character: cursorPos
  };
  
  // Asynchronicznie pobierz podpowiedzi z LSP
  return getCompletions(filePath, lspPosition).then(completions => {
    // Konwertuj podpowiedzi LSP na format CodeMirror
    const cmCompletions = completions.map(item => ({
      label: item.label,
      type: item.kind.toLowerCase(),
      detail: item.detail,
      info: item.documentation,
      apply: item.label
    }));
    
    // Pobierz pozycję, od której zaczyna się uzupełnienie
    const match = context.matchBefore(/[\w\d_\-\.]*/)
    const from = match ? lineStart + match.from : pos;
    
    return {
      from,
      options: cmCompletions
    };
  });
};

// LSP wsparcie - diagnostyka (lint)
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

  const editorViewRef = useRef<EditorView | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const lastContentRef = useRef(initialValue);
=======
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [documentVersion, setDocumentVersion] = useState(1)
  
  // Stan tooltipa hover zintegrowany bezpośrednio w komponencie 
  const [hoverState, setHoverState] = useState<{
    data: any;
    pos: { top: number; left: number };
    isVisible: boolean;
  } | null>(null);

  const showHover = (data: any, pos: { top: number; left: number }) => {
    setHoverState({ data, pos, isVisible: true });
  };

  const hideHover = () => {
    setHoverState(null);
  };
  
  // Hook do inicjalizacji LSP dla aktualnego pliku
  const { 
    startLspServer, 
    isWebSocketRunning, 
    isServerRunning, 
    openDocument, 
    updateDocument, 
    closeDocument 
  } = useLspStore();
  
  // Obsługa aktualizacji pliku i inicjalizacji LSP dla określonego języka
  useEffect(() => {
    if (filePath && language && isWebSocketRunning) {
      
      // Użyj funkcji z backendu Rust do znalezienia katalogu głównego projektu
      const getProjectRoot = async (filePath: string, lang: string): Promise<string> => {
        try {
          // Wywołaj funkcję Rust przez API Tauri
          const rootPath = await invoke('find_project_root', { filePath, language: lang });
          console.log(`Found project root: ${rootPath} for file: ${filePath}, language: ${lang}`);
          return rootPath as string;
        } catch (error) {
          console.error('Error finding project root:', error);
          // Fallback: użyj katalogu pliku jako rootPath
          return filePath.substring(0, filePath.lastIndexOf('/'));
        }
      };
      
      // Rozpocznij inicjalizację LSP zgodnie ze standardem protokołu
      (async () => {
        try {
          // Znajdź katalog główny projektu
          const rootPath = await getProjectRoot(filePath, language);
          
          // Jeśli serwer LSP nie jest uruchomiony, zainicjuj go
          if (!isServerRunning) {
            await startLspServer(language, rootPath);
          }
          
          // Po inicjalizacji serwera otwórz dokument
          if (initialValue !== undefined) {
            await openDocument(filePath, language, initialValue);
            console.log(`Opened document: ${filePath}`);
          }
        } catch (err) {
          console.error(`Failed to initialize LSP for ${language}:`, err);
        }
      })();
    }
    
    // Przy odmontowaniu komponentu zamknij dokument
    return () => {
      if (filePath && isServerRunning) {
        closeDocument(filePath).catch(err => 
          console.error(`Error closing document ${filePath}:`, err)
        );
      }
    };
  }, [filePath, language, isWebSocketRunning, isServerRunning, startLspServer, openDocument, closeDocument, initialValue]);

  
  // Add event listener for navigate-to-position event
  useEffect(() => {

    if (editorContainerRef.current && !editorViewRef.current && !isInitializedRef.current) {
      isInitializedRef.current = true;
      
      const extensions = getEditorExtensions({
        language,
        readOnly,
        onChange: (content) => {
          if (content !== lastContentRef.current) {
            lastContentRef.current = content;
            onChange?.(content);
          }
        },
        onSave: () => {
          onSave?.();
        },
      });

      const startState = EditorState.create({
        doc: initialValue || '',
        extensions: [
          ...extensions,
          EditorView.editable.of(!readOnly),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const content = update.state.doc.toString();
              if (content !== lastContentRef.current) {
                lastContentRef.current = content;
                onChange?.(content);
              }
            }
          }),
        ],
      });
=======
    const handleNavigation = (event: CustomEvent<{ line: number; character: number }>) => {
      if (!viewRef.current) return;
      
      const { line, character } = event.detail;
      
      // Get document lines
      const doc = viewRef.current.state.doc;
      
      // Calculate position in the document
      // Go to the specified line (we add 1 since line numbers are 0-based in LSP)
      const targetLine = Math.min(doc.lines, line + 1);
      const lineStart = doc.line(targetLine).from;
      const lineLength = doc.line(targetLine).length;
      
      // Calculate the target position
      const pos = lineStart + Math.min(character, lineLength);
      
      // Create a selection at the target position and scroll to it
      const transaction = viewRef.current.state.update({
        selection: { anchor: pos, head: pos },
        scrollIntoView: true
      });
      
      // Apply the transaction
      viewRef.current.dispatch(transaction);
    };
    
    // Add the event listener
    window.addEventListener('navigate-to-position', handleNavigation as EventListener);
    
    // Clean up the event listener on unmount
    return () => {
      window.removeEventListener('navigate-to-position', handleNavigation as EventListener);
    };
  }, []);

  // Nasłuchuj zmian zawartości i powiadamiaj serwer LSP o zmianach
  useEffect(() => {
    if (onChange && filePath && isServerRunning) {
      const handleChange = (content: string) => {
        setDocumentVersion(version => {
          const newVersion = version + 1;
          // Powiadom LSP o zmianie zawartości dokumentu
          updateDocument(filePath, content, newVersion).catch(err => 
            console.error(`Error updating document ${filePath}:`, err)
          );
          return newVersion;
        });
        
        onChange(content);
      };
      
      if (editorView) {
        const changeListener = EditorView.updateListener.of(update => {
          if (update.docChanged) {
            handleChange(update.state.doc.toString());
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

  // Konfiguracja tooltipa hover dla CodeMirror
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
      
      if (!hoverInfo) {
        return null;
      }
      
      if (hoverInfo.formattedContents) {
        const posCoords = view.coordsAtPos(pos);
        if (posCoords) {
          // Pokaż custom tooltip
          setTimeout(() => {
            showHoverFn(hoverInfo.formattedContents, {
              top: posCoords.top + 20,
              left: posCoords.left
            });
          }, 0);
        }
      }
      
      // Zwróć null, aby uniknąć domyślnego tooltipa
      return null;
    }, {
      hideOnChange: true,
      hoverTime: 300,
    });
  };

  // Resetuj edytor gdy zmienia się filePath
  useEffect(() => {
    // Ukryj tooltip przy zmianie pliku
    hideHover();
    
    if (!editorRef.current) return;
    
    // Zniszcz poprzedni widok edytora
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
      setEditorView(null);
    }
    
    // Utwórz funkcję pomocniczą dla lspHover, która korzysta 
    // z aktualnych funkcji showHover i hideHover
    const lspHoverExtension = createLspHover(
      new EditorView({state: EditorState.create({doc: ""})}), 
      showHover
    );
    
    // Utwórz nowy state i widok
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


      editorViewRef.current = view;
    }

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    if (editorViewRef.current && isInitializedRef.current) {
      const currentContent = editorViewRef.current.state.doc.toString();
      if (currentContent !== initialValue) {
        lastContentRef.current = initialValue;
        editorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: initialValue || '',
          },
        });
      }
    }
  }, [initialValue]);

  useEffect(() => {
    if (editorViewRef.current && isInitializedRef.current) {
      const extensions = getEditorExtensions({
        language,
        readOnly,
        onChange: (content) => {
          if (content !== lastContentRef.current) {
            lastContentRef.current = content;
            onChange?.(content);
          }
        },
        onSave: () => {
          onSave?.();
        },
      });

      editorViewRef.current.dispatch({
        effects: StateEffect.reconfigure.of([
          ...extensions,
          EditorView.editable.of(!readOnly),
          EditorView.lineWrapping,
        ]),
      });
    }
  }, [language, readOnly]);

  const getLanguageLabel = (lang: string): string => {
=======
    viewRef.current = view;
    setEditorView(view);
    
    // Cleanup przy odmontowaniu
    return () => {
      hideHover();
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [filePath, initialValue, language, readOnly, onChange, onSave]);
  
  // Pobierz rozszerzenie języka na podstawie języka
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

  return (
    <div className={cn("relative h-full w-full rounded-md border", className)}>
      <ScrollArea className="h-full w-full">
        <div className="relative h-full min-h-[200px]" ref={editorRef} />
      </ScrollArea>
      
      {/* Dodajemy portal dla tooltipa hover */}
      {hoverState?.isVisible && createPortal(
        <HoverTooltip 
          data={hoverState.data}
          position={hoverState.pos}
          onClose={hideHover}
        />,
        document.body
      )}
    </div>
  );
} 