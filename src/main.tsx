import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/App.css";
import { FileContextProvider } from "@/lib/file-context";
import { useLspStore } from "@/lib/stores/lsp-store";

function LspInitializer() {
  const { startLspWebSocketServer, isWebSocketRunning, stopLspWebSocketServer } = useLspStore();
  
  useEffect(() => {
    
    const LSP_WEBSOCKET_PORT = 1520;
    
    const setupLspServer = async () => {
      try {
        
        if (!isWebSocketRunning) {
          console.log(`Initializing LSP WebSocket server on port ${LSP_WEBSOCKET_PORT}...`);
          await startLspWebSocketServer(LSP_WEBSOCKET_PORT);
        } else {
          console.log('LSP WebSocket server already running');
        }
      } catch (err) {
        console.error('Error initializing LSP WebSocket server:', err);
      }
    };
    
    setupLspServer();
    
    
    return () => {
      
      if (isWebSocketRunning) {
        stopLspWebSocketServer()
          .catch(err => console.error('Error stopping LSP WebSocket server:', err));
      }
    };
  }, [startLspWebSocketServer, stopLspWebSocketServer, isWebSocketRunning]);
  
  return null;
}

document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <FileContextProvider>
      <LspInitializer />
      <App />
    </FileContextProvider>
);
