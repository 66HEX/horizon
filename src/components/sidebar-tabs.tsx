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
    <div className="w-12 bg-sidebar-accent/50 flex flex-col items-center py-2 rounded-md">
      <button
        onClick={() => setActiveTab("files")}
        className={`p-2 rounded-md mb-2 cursor-pointer ${activeTab === "files" ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}
      >
        <IconFolder className="h-4 w-4" />
      </button>
      <button
        onClick={() => setActiveTab("search")}
        className={`p-2 rounded-md mb-2 cursor-pointer ${activeTab === "search" ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}
      >
        <IconSearch className="h-4 w-4" />
      </button>
      <button
        onClick={() => setActiveTab("diagnostics")}
        className={`p-2 rounded-md mb-2 cursor-pointer relative ${activeTab === "diagnostics" ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}
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
        className={`p-2 rounded-md cursor-pointer ${activeTab === "git" ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}
      >
        <IconGitBranch className="h-4 w-4" />
      </button>
    </div>
  );
} 