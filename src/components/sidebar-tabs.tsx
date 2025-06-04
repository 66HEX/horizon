import { IconFolder, IconSearch, IconAlertTriangle, IconGitBranch } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";

export interface SidebarTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  diagnosticSummary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    total: number;
  };
}

export function SidebarTabs({ activeTab, setActiveTab, diagnosticSummary }: SidebarTabsProps) {
  return (
    <div className="w-12 bg-sidebar-accent/20 border-r border-sidebar-border flex flex-col items-center py-2">
      <button
        onClick={() => setActiveTab("files")}
        className={`p-2 rounded-md mb-2 cursor-pointer transition-all duration-300 ${activeTab === "files" ? "bg-sidebar-accent text-accent-foreground" : "hover:bg-sidebar-accent/50 hover:text-accent-foreground"}`}
      >
        <IconFolder className="h-4 w-4" />
      </button>
      <button
        onClick={() => setActiveTab("search")}
        className={`p-2 rounded-md mb-2 cursor-pointer transition-all duration-300 ${activeTab === "search" ? "bg-sidebar-accent text-accent-foreground" : "hover:bg-sidebar-accent/50 hover:text-accent-foreground"}`}
      >
        <IconSearch className="h-4 w-4" />
      </button>
      <button
        onClick={() => setActiveTab("diagnostics")}
        className={`p-2 rounded-md mb-2 cursor-pointer relative transition-all duration-300 ${activeTab === "diagnostics" ? "bg-sidebar-accent text-accent-foreground" : "hover:bg-sidebar-accent/50 hover:text-accent-foreground"}`}
      >
        <IconAlertTriangle className="h-4 w-4" />
        {diagnosticSummary.total > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 p-1 h-4 min-w-4 flex items-center justify-center text-xs" 
            variant={diagnosticSummary.errorCount > 0 ? "destructive" : diagnosticSummary.warningCount > 0 ? "warning" : "default"}
          >
            {diagnosticSummary.total}
          </Badge>
        )}
      </button>
      <button
        onClick={() => setActiveTab("git")}
        className={`p-2 rounded-md cursor-pointer transition-all duration-300 ${activeTab === "git" ? "bg-sidebar-accent text-accent-foreground" : "hover:bg-sidebar-accent/50 hover:text-accent-foreground"}`}
      >
        <IconGitBranch className="h-4 w-4" />
      </button>
    </div>
  );
} 