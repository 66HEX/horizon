import { IconFile, IconAlertTriangle } from "@tabler/icons-react";
import { SidebarGroupLabel, SidebarGroupContent, SidebarMenu } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DiagnosticItem } from "@/lib/stores/lsp-store";

interface SidebarDiagnosticsTabProps {
  filesDiagnostics: Record<string, DiagnosticItem[]>;
  openFileFromPath: (path: string) => Promise<void>;
  diagnosticSummary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    total: number;
  };
  currentFilePath: string | null;
}

export function SidebarDiagnosticsTab({
  filesDiagnostics,
  openFileFromPath,
  diagnosticSummary,
  currentFilePath
}: SidebarDiagnosticsTabProps) {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 w-full">
        <div className="flex w-full justify-between items-center gap-2">
          <SidebarGroupLabel className="mb-0">
            {`Diagnostics ${diagnosticSummary.total > 0 ? `(${diagnosticSummary.total})` : ''}`}
          </SidebarGroupLabel>
          {diagnosticSummary.total > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {diagnosticSummary.errorCount > 0 && (
                <div className="flex items-center">
                  <span className="text-destructive mr-1">{diagnosticSummary.errorCount}</span>
                  <span>Errors</span>
                </div>
              )}
              {diagnosticSummary.warningCount > 0 && (
                <div className="flex items-center ml-2">
                  <span className="text-warning mr-1">{diagnosticSummary.warningCount}</span>
                  <span>Warnings</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SidebarGroupContent className="relative overflow-hidden h-full">
        <ScrollArea className="absolute inset-0 w-full h-full" type="auto" scrollHideDelay={400}>
          <SidebarMenu>
            {!currentFilePath && Object.keys(filesDiagnostics).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
                <p className="text-xs mt-2">No diagnostics available</p>
              </div>
            ) : diagnosticSummary.total > 0 ? (
              <div className="p-1">
                {Object.entries(filesDiagnostics).map(([filePath, fileDiagnostics]: [string, DiagnosticItem[]]) => {
                  if (fileDiagnostics.length === 0) return null;
                  
                  // Extract file name from path
                  const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
                  
                  return (
                    <div key={`file-${filePath}`} className="mb-3">
                      <div className="flex items-center px-2 py-1 text-xs font-medium border-b border-sidebar-border/20">
                        <IconFile className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                        <span 
                          className="cursor-pointer hover:text-primary transition-colors truncate"
                          onClick={() => filePath && openFileFromPath(filePath)}
                        >
                          {fileName}
                        </span>
                        <Badge className="ml-2" variant={
                          fileDiagnostics.some((d: DiagnosticItem) => d.severity === 'error') ? "destructive" :
                          fileDiagnostics.some((d: DiagnosticItem) => d.severity === 'warning') ? "warning" : "default"
                        }>
                          {fileDiagnostics.length}
                        </Badge>
                      </div>
                      {fileDiagnostics.map((diagnostic, index) => (
                        <div 
                          key={`diagnostic-${filePath}-${index}`} 
                          className="p-2 mb-1 text-xs rounded-md hover:bg-sidebar-accent/10 cursor-pointer border-l-2 border-l-transparent hover:border-l-sidebar-accent transition-colors"
                          style={{
                            borderLeftColor: diagnostic.severity === 'error' 
                              ? 'var(--destructive)' 
                              : diagnostic.severity === 'warning' 
                                ? 'var(--warning)' 
                                : 'var(--muted)'
                          }}
                          onClick={() => {
                            // Open the file and navigate to the diagnostic location
                            if (filePath) {
                              openFileFromPath(filePath).then(() => {
                                // Navigate to the specific location
                                const event = new CustomEvent('navigate-to-position', {
                                  detail: {
                                    line: diagnostic.range.start.line,
                                    character: diagnostic.range.start.character
                                  }
                                });
                                window.dispatchEvent(event);
                              });
                            }
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-shrink-0 mt-0.5">
                              {diagnostic.severity === 'error' ? (
                                <IconAlertTriangle className="h-3.5 w-3.5 text-destructive" />
                              ) : diagnostic.severity === 'warning' ? (
                                <IconAlertTriangle className="h-3.5 w-3.5 text-warning" />
                              ) : (
                                <IconAlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-grow">
                              <div className="font-medium mb-0.5">
                                {diagnostic.message}
                              </div>
                              <div className="text-muted-foreground">
                                Line {diagnostic.range.start.line + 1}, Column {diagnostic.range.start.character + 1}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
                <IconAlertTriangle className="h-10 w-10 mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm">No diagnostics found</p>
                <p className="text-xs mt-1">No errors or warnings were detected</p>
              </div>
            )}
          </SidebarMenu>
        </ScrollArea>
      </SidebarGroupContent>
    </>
  );
} 