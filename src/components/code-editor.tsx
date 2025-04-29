"use client"

import { useEffect, useRef } from "react"
import { EditorState, StateEffect } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { cn } from "@/lib/utils"
import { autocompletion, completionKeymap } from "@codemirror/autocomplete"
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
import { lintKeymap } from "@codemirror/lint"
import { EditorView, keymap } from "@codemirror/view"
import { searchKeymap } from "@codemirror/search"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { ScrollArea } from "./ui/scroll-area"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { lineNumbers, highlightActiveLineGutter } from "@codemirror/view"
import { bracketMatching, foldGutter } from "@codemirror/language"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"

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
}

function getEditorExtensions({
  language,
  readOnly,
  onChange,
  onSave,
}: {
  language: string;
  readOnly: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
}) {
  let langExtension;
  switch (language) {
    case "html":
      langExtension = html();
      break;
    case "css":
      langExtension = css();
      break;
    case "javascript":
      langExtension = javascript();
      break;
    case "typescript":
      langExtension = javascript({ typescript: true });
      break;
    case "jsx":
      langExtension = javascript({ jsx: true });
      break;
    case "tsx":
      langExtension = javascript({ jsx: true, typescript: true });
      break;
    case "json":
      langExtension = json();
      break;
    case "python":
      langExtension = python();
      break;
    case "java":
      langExtension = java();
      break;
    case "rust":
      langExtension = rust();
      break;
    case "cpp":
    case "c++":
    case "c":
      langExtension = cpp();
      break;
    case "php":
      langExtension = php();
      break;
    case "xml":
      langExtension = xml();
      break;
    case "markdown":
    case "md":
      langExtension = markdown();
      break;
    case "sql":
      langExtension = sql();
      break;
    case "sass":
      langExtension = sass();
      break;
    case "less":
      langExtension = less();
      break;
    case "yaml":
      langExtension = yaml();
      break;
      
    default:
      langExtension = javascript({ typescript: true });
  }

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    foldGutter(),
    bracketMatching(),
    closeBrackets(),
    langExtension,
    shadcnTheme,
    syntaxHighlighting(shadcnHighlightStyle),
    autocompletion(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        if (onChange) {
          onChange(newContent);
        }
      }
    }),
    EditorView.editable.of(!readOnly),
    EditorView.domEventHandlers({
      focus: () => {
        return false;
      },
      blur: () => {
        return false;
      },
      keydown: (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          if (onSave) {
            onSave();
          }
          return true;
        }
        return false;
      }
    }),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...searchKeymap,
      ...lintKeymap,
      ...closeBracketsKeymap,
      indentWithTab
    ])
  ];
}

export function CodeEditor({
  initialValue,
  onChange,
  language,
  readOnly = false,
  onSave,
  className,
}: CodeEditorProps) {
  const editorViewRef = useRef<EditorView | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const lastContentRef = useRef(initialValue);
  
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

      const view = new EditorView({
        state: startState,
        parent: editorContainerRef.current,
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
    switch (lang) {
      case "html": return "HTML";
      case "css": return "CSS";
      case "javascript": return "JavaScript";
      case "typescript": return "TypeScript";
      case "jsx": return "JSX";
      case "tsx": return "TypeScript JSX";
      case "mjs": return "JavaScript Module";
      case "python": return "Python";
      case "ruby": return "Ruby";
      case "php": return "PHP";
      case "java": return "Java";
      case "go": return "Go";
      case "rust": return "Rust";
      case "c": return "C";
      case "cpp": return "C++";
      case "csharp": return "C#";
      case "json": return "JSON";
      case "yaml": return "YAML";
      case "markdown": return "Markdown";
      case "sql": return "SQL";
      case "shell": return "Shell";
      case "xml": return "XML";
      case "sass": return "Sass";
      case "less": return "Less";
      default: return lang.charAt(0).toUpperCase() + lang.slice(1);
    }
  };

  return (
    <div className={cn("relative w-full h-full", className)}>
      <div className="absolute inset-0">
        <ScrollArea className="absolute inset-0 w-full h-full" type="always">
          <div 
            ref={editorContainerRef}
            className="absolute inset-0"
            data-editor-container
            style={{ overscrollBehavior: "none" }}
          />
          <div className="absolute bottom-2 right-2 px-2.5 py-1 text-xs font-medium bg-primary/5 text-primary/70 rounded-md border border-primary/10 select-none opacity-80 hover:opacity-100 transition-opacity">
            {getLanguageLabel(language)}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
} 