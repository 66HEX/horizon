import { useRef, useEffect, useCallback, memo, useState, useMemo } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import {
    SidebarInset,
    SidebarProvider,
    useSidebar
} from "@/components/ui/sidebar"
import { CodeEditor } from "./components/code-editor"
import { FileInfo } from "./lib/file-service"
import { ImageViewer } from "@/components/image-viewer"
import { convertFileSrc } from "@tauri-apps/api/core"
import Terminal from "./components/terminal"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { Button } from "@/components/ui/button"
import { FileSelectionTabs } from "@/components/ui/file-selection-tabs"
import { IconLayoutSidebar, IconLayoutBottombar, IconLayoutSidebarFilled, IconLayoutBottombarFilled } from "@tabler/icons-react"
import { AudioPlayer } from "@/components/audio-player.tsx"
import { useFileStore } from "@/lib/stores"

interface TerminalInstance {
  id: string;
  name: string;
  state: {
    output: string[];
    currentInput: string;
    sessionId: string | null;
    commandHistory: string[];
    historyIndex: number;
    isLocked: boolean;
  };
  workingDirectory: string;
  processName: string;
}

const EditorContainer = memo(({ file, language, onChangeContent, onSave }: {
    file: FileInfo;
    language: string;
    onChangeContent: (content: string) => void;
    onSave: () => void;
}) => {
    return (
        <div className="w-full h-full">
            <CodeEditor 
                key={file.id}
                initialValue={file.content || ''}
                onChange={onChangeContent}
                language={language}
                onSave={onSave}
            />
        </div>
    );
}, (prevProps, nextProps) => {
    return prevProps.file.id === nextProps.file.id &&
           prevProps.file.path === nextProps.file.path &&
           prevProps.file.content === nextProps.file.content &&
           prevProps.language === nextProps.language;
});

function MainContent() {
    const { 
        currentFile, 
        updateFileContent, 
        activeFilePath,
        isImageFile,
        isAudioFile,
        saveFile
    } = useFileStore();
    
    const { state: sidebarState } = useSidebar();
    const prevFilePathRef = useRef<string | null>(null);
    
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);
    const [terminalInstances, setTerminalInstances] = useState<TerminalInstance[]>([]);
    const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
    
    const handleContentChange = useCallback((content: string) => {
        if (currentFile) {
            updateFileContent(content);
        }
    }, [updateFileContent, currentFile]);

    const handleSaveFile = useCallback(() => {
        if (currentFile) {
            saveFile(currentFile.content || '');
        }
    }, [saveFile, currentFile]);
    
    useEffect(() => {
        if (prevFilePathRef.current !== activeFilePath) {
            prevFilePathRef.current = activeFilePath;
        }
    }, [activeFilePath]);

const getLanguageFromExtension = useCallback((fileName: string) => {
    if (!fileName || !fileName.includes('.')) return 'typescript';
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'js': return 'javascript';
        case 'jsx': return 'jsx';
        case 'ts': return 'typescript';
        case 'tsx': return 'tsx';
        case 'mjs': return 'mjs';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'json': return 'json';
        
        case 'py': return 'python';
        case 'rb': return 'ruby';
        case 'php': return 'php';
        case 'java': return 'java';
        case 'go': return 'go';
        case 'rs': return 'rust';
        case 'c': return 'c';
        case 'cpp': 
        case 'cc':
        case 'cxx': return 'cpp';
        case 'cs': return 'csharp';
        
        case 'yml':
        case 'yaml': return 'yaml';
        case 'xml': return 'xml';
        case 'md': return 'markdown';
        case 'sql': return 'sql';
        
        case 'sh':
        case 'bash': return 'shell';
        
        case 'swift': return 'swift';
        case 'kt': return 'kotlin';
        case 'dart': return 'dart';
        
        case 'sass':
        case 'scss': return 'sass';
        case 'less': return 'less';
        
        default: return 'typescript';
    }
}, []);

const fileLanguage = useMemo(() => 
    currentFile ? getLanguageFromExtension(currentFile.name) : 'typescript',
[currentFile?.name, getLanguageFromExtension]);
=======
        
        onSave();
    };
        
    return (
        <CodeEditor 
            initialValue={file.content}
            onChange={handleChange}
            language={language}
            onSave={handleSave}
            filePath={file.path}
        />
    );
}, (prevProps, nextProps) => {
    const isEqual = prevProps.file.id === nextProps.file.id &&
                prevProps.file.path === nextProps.file.path &&
                prevProps.language === nextProps.language;
    
    return isEqual;
});

function MainContent() {
    const { 
        currentFile, 
        updateFileContent, 
        activeFilePath,
        isImageFile,
        isAudioFile,
        saveFile
    } = useFileStore();
    
    const { state: sidebarState } = useSidebar();
    const prevFilePathRef = useRef<string | null>(null);
    
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);
    const [terminalInstances, setTerminalInstances] = useState<TerminalInstance[]>([]);
    const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
    
    const handleContentChange = useCallback((content: string) => {
        updateFileContent(content);
    }, [updateFileContent]);

    const handleSaveFile = useCallback(() => {
        if (currentFile) {
    
            let contentToSave = currentFile.content;
            
            const editorContainer = document.querySelector('[data-editor-container]') as any;
            if (editorContainer && editorContainer.__currentContent) {
                contentToSave = editorContainer.__currentContent;
            }
            else if (contentToSave.length === 0 && editorContainer) {
                const editorContent = editorContainer.querySelector('.cm-content')?.textContent;
                if (editorContent && editorContent.length > 0) {
                    contentToSave = editorContent;
                }
            }
            saveFile(contentToSave);
        }
    }, [saveFile, currentFile?.id, currentFile?.path]);
    
    useEffect(() => {
        if (prevFilePathRef.current !== activeFilePath) {
            prevFilePathRef.current = activeFilePath;
        }
    }, [activeFilePath]);

const getLanguageFromExtension = useCallback((fileName: string) => {
    if (!fileName || !fileName.includes('.')) return 'typescript';
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    // Log detected extension for debugging
    console.log(`Detecting language for file extension: ${ext}`);
    
    switch (ext) {
        case 'js': return 'javascript';
        case 'jsx': return 'jsx';
        case 'ts': return 'typescript';
        case 'tsx': return 'tsx';
        case 'mjs': return 'mjs';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'json': return 'json';
        
        case 'py': return 'python';
        case 'rb': return 'ruby';
        case 'php': return 'php';
        case 'java': return 'java';
        case 'go': return 'go';
        case 'rs': return 'rust';
        case 'c': return 'c';
        case 'cpp': 
        case 'cc':
        case 'cxx': return 'cpp';
        case 'cs': return 'csharp';
        
        case 'yml':
        case 'yaml': return 'yaml';
        case 'xml': return 'xml';
        case 'md': return 'markdown';
        case 'sql': return 'sql';
        
        case 'sh':
        case 'bash': return 'shell';
        
        case 'swift': return 'swift';
        case 'kt': return 'kotlin';
        case 'dart': return 'dart';
        
        case 'sass':
        case 'scss': return 'sass';
        case 'less': return 'less';
        
        default: return 'typescript';
    }
}, []);

const fileLanguage = useMemo(() => {
    const lang = currentFile ? getLanguageFromExtension(currentFile.name) : 'typescript';
    console.log(`Detected language for ${currentFile?.name}: ${lang}`);
    return lang;
}, [currentFile?.name, getLanguageFromExtension]);


const EditorContentArea = useMemo(() => {
   
    if (!currentFile) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                    No file selected
                </p>
            </div>
        );
    }
    
    if (isImageFile(currentFile.path)) {
        return <ImageViewer src={convertFileSrc(currentFile.path)} />;
    }
    
    if (isAudioFile(currentFile.path)) {
        return (
            <div className="h-full">
                <AudioPlayer 
                    key={currentFile.path}
                    src={convertFileSrc(currentFile.path)} 
                    fileName={currentFile.name}
                />
            </div>
        );
    }
    
    return (
        <EditorContainer
            file={currentFile}
            language={fileLanguage}
            onChangeContent={handleContentChange}
            onSave={handleSaveFile}
        />
    );
}, [
    currentFile?.id,
    fileLanguage,
    handleContentChange,
    handleSaveFile,
    isImageFile,
    isAudioFile
]);

return (
    <ThemeProvider forceDarkMode={true}>
        <AppSidebar variant="inset"/>
        <SidebarInset className="border rounded-xl select-none">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-sidebar rounded-t-xl">
                <FileSelectionTabs />
                <div className="ml-auto flex gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => document.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                        title="Toggle Sidebar"
                    >
                        {sidebarState === "collapsed" ? (
                            <IconLayoutSidebar className="h-4 w-4" />
                        ) : (
                            <IconLayoutSidebarFilled className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsTerminalVisible(!isTerminalVisible)}
                        title={isTerminalVisible ? "Hide Terminal" : "Show Terminal"}
                    >
                        {isTerminalVisible ? (
                            <IconLayoutBottombarFilled className="h-4 w-4" />
                        ) : (
                            <IconLayoutBottombar className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </header>
            
            <div className="flex flex-1 flex-col rounded-b-xl">
                <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={isTerminalVisible ? 60 : 100}>
                        {EditorContentArea}
                    </ResizablePanel>
                    {isTerminalVisible && (
                        <>
                            <ResizableHandle />
                            <ResizablePanel defaultSize={40}>
                                <div className="select-text w-full h-full">
                                    <Terminal
                                        onClose={() => setIsTerminalVisible(false)}
                                        isTerminalVisible={isTerminalVisible}
                                        instances={terminalInstances}
                                        setInstances={setTerminalInstances}
                                        activeInstanceId={activeTerminalId}
                                        setActiveInstanceId={setActiveTerminalId}
                                    />
                                </div>
                            </ResizablePanel>
                        </>
                    )}
                </ResizablePanelGroup>
            </div>
        </SidebarInset>
    </ThemeProvider>
);
}

export default function App() {
    return (
        <SidebarProvider>
            <MainContent />
        </SidebarProvider>
    );
}
