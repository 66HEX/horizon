import React, { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { cn } from "@/lib/utils";
import { IconX, IconPlus, IconTerminal } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useFileContext } from "@/lib/file-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { open } from '@tauri-apps/plugin-shell';

interface TerminalProps {
  workingDirectory?: string;
  onClose: () => void;
  className?: string;
  isTerminalVisible: boolean;
  instances: TerminalInstance[];
  setInstances: React.Dispatch<React.SetStateAction<TerminalInstance[]>>;
  activeInstanceId: string | null;
  setActiveInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface TerminalState {
  output: string[];
  currentInput: string;
  sessionId: string | null;
  commandHistory: string[];
  historyIndex: number;
  isLocked: boolean;
}

interface TerminalInstance {
  id: string;
  name: string;
  state: TerminalState;
  workingDirectory: string;
  processName: string;
}

const detectUrls = (text: string): { text: string; isUrl: boolean; url: string }[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts: { text: string; isUrl: boolean; url: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, match.index),
        isUrl: false,
        url: ''
      });
    }
    parts.push({
      text: match[0],
      isUrl: true,
      url: match[0]
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.substring(lastIndex),
      isUrl: false,
      url: ''
    });
  }

  return parts;
};

const Terminal: React.FC<TerminalProps> = ({ 
  workingDirectory, 
  onClose, 
  className, 
  instances,
  setInstances,
  activeInstanceId,
  setActiveInstanceId
}) => {
  const { currentDirectory } = useFileContext();
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await invoke<string[]>('load_command_history');
        if (history && history.length > 0) {
          setInstances(prev => prev.map(instance => ({
            ...instance,
            state: {
              ...instance.state,
              commandHistory: history
            }
          })));
        }
      } catch (error) {
        console.error('Failed to load command history:', error);
      }
    };

    loadHistory();
  }, []);

  useEffect(() => {
    const updateProcessNames = async () => {
      for (const instance of instances) {
        try {
          const processName = await invoke<string>('get_terminal_process_name', { id: instance.id });
          if (processName !== instance.processName) {
            setInstances(prev => prev.map(i => 
              i.id === instance.id 
                ? { ...i, processName, name: processName }
                : i
            ));
          }
        } catch (error) {
          console.error('Failed to update process name:', error);
        }
      }
    };

    const interval = setInterval(updateProcessNames, 1000);
    return () => clearInterval(interval);
  }, [instances]);

  useEffect(() => {
    const saveHistory = async () => {
      const activeInstance = instances.find(i => i.id === activeInstanceId);
      if (activeInstance && activeInstance.state.commandHistory.length > 0) {
        try {
          await invoke('save_command_history', { 
            history: activeInstance.state.commandHistory 
          });
        } catch (error) {
          console.error('Failed to save command history:', error);
        }
      }
    };

    saveHistory();
  }, [instances, activeInstanceId]);

  const createNewInstance = async () => {
    try {
      const id = await invoke<string>('create_terminal_session', {
        workingDir: currentDirectory || workingDirectory || '.'
      });

      const processName = await invoke<string>('get_terminal_process_name', { id });

      const newInstance: TerminalInstance = {
        id,
        name: processName || `Terminal ${instances.length + 1}`,
        state: {
          output: [],
          currentInput: '',
          sessionId: id,
          commandHistory: [],
          historyIndex: 0,
          isLocked: false
        },
        workingDirectory: currentDirectory || workingDirectory || '.',
        processName: processName || 'bash'
      };

      setInstances(prev => [...prev, newInstance]);
      setActiveInstanceId(id);

      const stdoutUnlisten = await listen<string>(`terminal_output_${id}`, (event) => {
        let output = '';
        if (typeof event.payload === 'string') {
          output = event.payload;
        } else if (Array.isArray(event.payload)) {
          output = String.fromCharCode(...(event.payload as number[]));
        } else {
          output = String(event.payload);
        }
        setInstances(prev => prev.map(instance => 
          instance.id === id 
            ? { ...instance, state: { ...instance.state, output: [...instance.state.output, output] } }
            : instance
        ));
      });

      const stderrUnlisten = await listen<string>(`terminal_error_${id}`, (event) => {
        let error = '';
        if (typeof event.payload === 'string') {
          error = event.payload;
        } else if (Array.isArray(event.payload)) {
          error = String.fromCharCode(...(event.payload as number[]));
        } else {
          error = String(event.payload);
        }
        setInstances(prev => prev.map(instance => 
          instance.id === id 
            ? { ...instance, state: { ...instance.state, output: [...instance.state.output, `Error: ${error}`] } }
            : instance
        ));
      });

      const exitUnlisten = await listen(`terminal_exit_${id}`, () => {
        setInstances(prev => prev.map(instance => 
          instance.id === id 
            ? { ...instance, state: { ...instance.state, output: [...instance.state.output, 'Process terminated.'] } }
            : instance
        ));
      });

      return () => {
        stdoutUnlisten();
        stderrUnlisten();
        exitUnlisten();
      };
    } catch (error) {
      console.error('Failed to create terminal session:', error);
    }
  };

  const handleInput = async (input: string, instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;

    if (input === '\x03') {
      console.log('Sending SIGINT signal');
      try {
        await invoke('send_terminal_signal', { 
          id: instanceId,
          signal: 'SIGINT'
        });

        setInstances(prev => prev.map(i => 
          i.id === instanceId 
            ? { 
                ...i, 
                state: { 
                  ...i.state, 
                  isLocked: false,
                  output: [...i.state.output, 'Process terminated.']
                } 
              }
            : i
        ));
      } catch (error) {
        console.error('Failed to handle Ctrl+C:', error);
        setInstances(prev => prev.map(i => 
          i.id === instanceId 
            ? { ...i, state: { ...i.state, isLocked: false } }
            : i
        ));
      }
      return;
    }

    if (instance.state.isLocked) {
      return;
    }

    if (input.trim().toLowerCase() === 'clear') {
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { ...i, state: { ...i.state, output: [] } }
          : i
      ));
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { 
              ...i, 
              state: { 
                ...i.state, 
                currentInput: '', 
                commandHistory: [...i.state.commandHistory, input],
                historyIndex: i.state.commandHistory.length + 1
              } 
            }
          : i
      ));
      return;
    }

    if (input.trim() === 'npm run dev') {
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { 
              ...i, 
              state: { 
                ...i.state, 
                isLocked: true,
                currentInput: '', 
                output: [...i.state.output, `$ ${input}`],
                commandHistory: [...i.state.commandHistory, input],
                historyIndex: i.state.commandHistory.length + 1
              } 
            }
          : i
      ));
    }

    setInstances(prev => prev.map(i => 
      i.id === instanceId 
        ? { 
            ...i, 
            state: { 
              ...i.state, 
              currentInput: '', 
              output: [...i.state.output, `$ ${input}`],
              commandHistory: [...i.state.commandHistory, input],
              historyIndex: i.state.commandHistory.length + 1
            } 
          }
        : i
    ));

    try {
      await invoke('send_terminal_command', {
        id: instanceId,
        command: input + '\n'
      });
    } catch (error) {
      console.error('Failed to send command:', error);
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { ...i, state: { ...i.state, output: [...i.state.output, `Error sending command: ${error}`] } }
          : i
      ));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (!activeInstanceId) return;
    
    const activeInstance = instances.find(i => i.id === activeInstanceId);
    if (!activeInstance) return;

    if (activeInstance.state.isLocked) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        console.log('Ctrl+C pressed on locked terminal');
        handleInput('\x03', activeInstanceId);
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault();
          handleInput('\x04', activeInstanceId);
          return;
        case 'l':
          e.preventDefault();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, output: [] } }
              : i
          ));
          return;
        case 'u':
          e.preventDefault();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, currentInput: '' } }
              : i
          ));
          return;
        case 'k':
          e.preventDefault();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, output: [], commandHistory: [] } }
              : i
          ));
          return;
        case 'a':
          e.preventDefault();
          const input = activeInstance.state.currentInput;
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, currentInput: input } }
              : i
          ));
          return;
        case 'e':
          e.preventDefault();
          return;
        case 'w':
          e.preventDefault();
          const words = activeInstance.state.currentInput.split(' ');
          words.pop();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, currentInput: words.join(' ') } }
              : i
          ));
          return;
        case 'r':
          e.preventDefault();
          return;
        case 't':
          e.preventDefault();
          createNewInstance();
          return;
        case 'n':
          e.preventDefault();
          createNewInstance();
          return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      const currentIndex = instances.findIndex(i => i.id === activeInstanceId);
      if (e.key === 'PageUp' && currentIndex > 0) {
        setActiveInstanceId(instances[currentIndex - 1].id);
      } else if (e.key === 'PageDown' && currentIndex < instances.length - 1) {
        setActiveInstanceId(instances[currentIndex + 1].id);
      }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const history = activeInstance.state.commandHistory;
      const currentIndex = activeInstance.state.historyIndex;
      
      if (e.key === 'ArrowUp' && currentIndex > 0) {
        setInstances(prev => prev.map(i => 
          i.id === activeInstanceId 
            ? { 
                ...i, 
                state: { 
                  ...i.state, 
                  currentInput: history[currentIndex - 1],
                  historyIndex: currentIndex - 1
                } 
              }
            : i
        ));
      } else if (e.key === 'ArrowDown' && currentIndex < history.length) {
        setInstances(prev => prev.map(i => 
          i.id === activeInstanceId 
            ? { 
                ...i, 
                state: { 
                  ...i.state, 
                  currentInput: currentIndex === history.length - 1 ? '' : history[currentIndex + 1],
                  historyIndex: currentIndex + 1
                } 
              }
            : i
        ));
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      // TODO: Autocomplete
      return;
    }

    if (e.key === 'Enter' && activeInstance.state.currentInput.trim()) {
      handleInput(activeInstance.state.currentInput.trim(), activeInstanceId);
    } else if (e.key === 'Backspace') {
      setInstances(prev => prev.map(i => 
        i.id === activeInstanceId 
          ? { ...i, state: { ...i.state, currentInput: i.state.currentInput.slice(0, -1) } }
          : i
      ));
    } else if (e.key.length === 1) {
      setInstances(prev => prev.map(i => 
        i.id === activeInstanceId 
          ? { ...i, state: { ...i.state, currentInput: i.state.currentInput + e.key } }
          : i
      ));
    }
  };

  const closeInstance = async (instanceId: string) => {
    try {
      await invoke('terminate_terminal_session', { id: instanceId });
      if (instanceId === activeInstanceId) {
        const remainingInstances = instances.filter(i => i.id !== instanceId);
        const lastInstance = remainingInstances[remainingInstances.length - 1];
        setActiveInstanceId(lastInstance?.id || null);
      }
      setInstances(prev => prev.filter(i => i.id !== instanceId));
    } catch (error) {
      console.error('Failed to terminate terminal session:', error);
    }
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [instances]);

  const activeInstance = instances.find(i => i.id === activeInstanceId);

  return (
    <div 
      className={cn(
        "flex flex-col h-full text-sidebar-foreground bg-background backdrop-blur-sm",
        className
      )}
      onKeyDown={handleKeyPress}
      tabIndex={0}
    >
      <div className="flex items-center justify-between py-2 px-4 border-b border-sidebar-border/20 bg-sidebar-accent/5">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-sidebar-foreground/90">
            {activeInstance?.name || 'Terminal'}
          </div>
          <div className="text-xs text-sidebar-foreground/50">
            {activeInstance?.workingDirectory || currentDirectory || workingDirectory || 'Default'}
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          title="Close Terminal"
          className="h-6 w-6 hover:bg-sidebar-accent/20 hover:text-sidebar-foreground transition-all duration-200"
        >
          <IconX className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col">
          <ScrollArea className="h-full cursor-text">
            <div 
              ref={terminalRef}
              className="p-4 font-mono text-sm text-sidebar-foreground/90"
            >
              {activeInstance?.state.output.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {detectUrls(line).map((part, j) => 
                    part.isUrl ? (
                      <span
                        key={j}
                        className="text-blue-400 hover:text-blue-300 cursor-pointer underline transition-colors duration-200"
                        onClick={async () => {
                          try {
                            await open(part.url);
                          } catch (error) {
                            console.error('Failed to open URL:', error);
                          }
                        }}
                      >
                        {part.text}
                      </span>
                    ) : (
                      <span key={j}>{part.text}</span>
                    )
                  )}
                </div>
              ))}
              <div className="flex items-center">
                <span className="text-emerald-400">$</span>
                <span className="ml-2 font-mono whitespace-pre">
                  {activeInstance?.state.currentInput}
                  {activeInstance?.state.isLocked && (
                    <span className="text-sidebar-foreground/50 ml-2">
                      (Terminal locked - press Ctrl+C to unlock)
                    </span>
                  )}
                </span>
                {activeInstance?.id === activeInstanceId && !activeInstance?.state.isLocked && (
                  <span className="bg-sidebar-foreground/70 w-1 h-4 ml-0 [animation:blink_1s_steps(1)_infinite] [@keyframes_blink{0%,100%{opacity:1}50%{opacity:0}}]"></span>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
        <Separator orientation="vertical" className="bg-sidebar-border/20" />
        <div className="w-48 flex flex-col bg-sidebar-accent/5">
          <ScrollArea className="flex-1 h-full">
            <div className="p-2 space-y-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-start hover:bg-sidebar-accent/20 hover:text-sidebar-foreground transition-all duration-200"
                title="Create New Terminal"
                onClick={createNewInstance}
              >
                <IconPlus className="h-4 w-4 mr-2" />
                New Terminal
              </Button>
              {instances.map((instance) => (
                <div
                  key={instance.id}
                  className={cn(
                    "flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-all duration-200",
                    instance.id === activeInstanceId 
                      ? "bg-sidebar-accent/20 text-sidebar-foreground" 
                      : "hover:bg-sidebar-accent/10 text-sidebar-foreground/70"
                  )}
                  title={`Open Terminal: ${instance.name}`}
                  onClick={() => setActiveInstanceId(instance.id)}
                >
                  <div className="flex items-center gap-2">
                    <IconTerminal className="h-4 w-4" />
                    <span className="truncate text-sm font-medium">{instance.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-sidebar-accent/20 transition-all duration-200"
                    title="Close Terminal"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeInstance(instance.id);
                    }}
                  >
                    <IconX className="h-4 w-4 text-sidebar-foreground/70" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default Terminal; 