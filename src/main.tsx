import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { FileContextProvider } from "./lib/file-context";
import { useLspStore } from "./lib/lsp-store";

// Komponent inicjalizujący LSP przy starcie
function LspInitializer() {
  const { startLspWebSocketServer, isWebSocketRunning, stopLspWebSocketServer } = useLspStore();
  
  useEffect(() => {
    // Port początkowy dla serwera WebSocket LSP
    const LSP_WEBSOCKET_PORT = 1520;
    
    const setupLspServer = async () => {
      try {
        // Sprawdź, czy serwer jest już uruchomiony
        if (!isWebSocketRunning) {
          console.log(`Inicjowanie serwera WebSocket LSP na porcie ${LSP_WEBSOCKET_PORT}...`);
          await startLspWebSocketServer(LSP_WEBSOCKET_PORT);
        } else {
          console.log('Serwer WebSocket LSP już uruchomiony');
        }
      } catch (err) {
        console.error('Błąd inicjalizacji serwera LSP WebSocket:', err);
      }
    };
    
    setupLspServer();
    
    // Czyszczenie przy odmontowaniu komponentu
    return () => {
      // Zatrzymaj serwer WebSocket gdy aplikacja jest zamykana
      if (isWebSocketRunning) {
        stopLspWebSocketServer()
          .catch(err => console.error('Błąd przy zatrzymywaniu serwera WebSocket LSP:', err));
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
