import { useEffect, useState, useMemo } from "react";
import { SidebarGroupLabel, SidebarGroupContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { 
  IconGitBranch, 
  IconGitCommit, 
  IconChevronDown, 
  IconChevronRight,
  IconRefresh,
  IconFolder,
  IconAlertCircle,
  IconUser,
  IconCalendar
} from "@tabler/icons-react";
import { useGitStore, GitBranch, GitCommit } from "@/lib/stores/git-store";
import { useFileContext } from "@/lib/file-context";

interface BranchItemProps {
  branch: GitBranch;
}

function BranchItem({ branch }: BranchItemProps) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-md text-sm hover:bg-sidebar-accent/50 ${
      branch.is_current ? 'bg-sidebar-accent/30 font-medium' : ''
    }`}>
      <IconGitBranch className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 truncate">{branch.name}</span>
      {branch.is_current && (
        <Badge variant="secondary" className="text-xs">
          current
        </Badge>
      )}
      {branch.is_remote && (
        <Badge variant="outline" className="text-xs">
          remote
        </Badge>
      )}
    </div>
  );
}

interface CommitItemProps {
  commit: GitCommit;
}

function CommitItem({ commit }: CommitItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return commit.date;
  };

  return (
    <div className="pb-3 last:pb-0">
      <div 
        className="flex items-start gap-2 p-2 rounded-md text-sm hover:bg-sidebar-accent/50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <IconGitCommit className="h-4 w-4 text-muted-foreground mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{commit.short_id}</span>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(commit.timestamp)}</span>
          </div>
          <p className="text-xs truncate mb-1">{commit.message}</p>
          {isExpanded && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <IconUser className="h-3 w-3" />
                <span>{commit.author_name}</span>
                {commit.author_email && (
                  <span className="text-muted-foreground/70">({commit.author_email})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <IconCalendar className="h-3 w-3" />
                <span>{commit.date}</span>
              </div>
            </div>
          )}
        </div>
        {isExpanded ? (
          <IconChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <IconChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

export function SidebarGitTab() {
  const { currentDirectory } = useFileContext();
  const { 
    status, 
    branches, 
    commits, 
    isLoading, 
    error,
    refreshGitData,
    isGitRepository,
    clearError
  } = useGitStore();

  const [isBranchesOpen, setIsBranchesOpen] = useState(true);
  const [isCommitsOpen, setIsCommitsOpen] = useState(true);

  const localBranches = useMemo(() => branches.filter(b => !b.is_remote), [branches]);
  const remoteBranches = useMemo(() => branches.filter(b => b.is_remote), [branches]);

  useEffect(() => {
    const checkAndLoadGitData = async () => {
      if (currentDirectory) {
        const isRepo = await isGitRepository(currentDirectory);
        if (isRepo) {
          await refreshGitData(currentDirectory);
        }
      }
    };

    checkAndLoadGitData();
  }, [currentDirectory, refreshGitData, isGitRepository]);

  const handleRefresh = async () => {
    if (currentDirectory) {
      clearError();
      await refreshGitData(currentDirectory);
    }
  };

  if (!currentDirectory) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2 w-full">
          <SidebarGroupLabel className="mb-0">Git</SidebarGroupLabel>
        </div>
        <SidebarGroupContent className="relative overflow-hidden h-full">
          <div className="mt-2 flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
            <IconFolder className="h-8 w-8 mb-2" />
            <p className="mb-2">No folder opened</p>
            <p className="text-xs">Open a folder to see git information</p>
          </div>
        </SidebarGroupContent>
      </>
    );
  }

  if (status && !status.is_repo) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2 w-full">
          <SidebarGroupLabel className="mb-0">Git</SidebarGroupLabel>
        </div>
        <SidebarGroupContent className="relative overflow-hidden h-full">
          <div className="mt-2 flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
            <IconGitBranch className="h-8 w-8 mb-2" />
            <p className="mb-2">Not a git repository</p>
            <p className="text-xs">Initialize git in this folder to see git information</p>
          </div>
        </SidebarGroupContent>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 w-full">
        <div className="flex w-full justify-between items-center gap-2">
          <SidebarGroupLabel className="mb-0">Git</SidebarGroupLabel>
          <Button
            variant="ghost" 
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-6 w-6 p-0"
          >
            <IconRefresh className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <SidebarGroupContent className="relative overflow-hidden h-full">
        <ScrollArea className="absolute inset-0 w-full h-full max-h-[calc(100vh-100px)]" type="auto" scrollHideDelay={400}>
          <div className="space-y-4 p-2">
            {error && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
                <IconAlertCircle className="h-4 w-4" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Current Branch Status */}
            {status && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-md bg-sidebar-accent/20">
                  <IconGitBranch className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-sm">
                    {status.current_branch || 'HEAD detached'}
                  </span>
                  {status.has_changes && (
                    <Badge variant="outline" className="text-xs">
                      changes
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Branches Section */}
            <Collapsible open={isBranchesOpen} onOpenChange={setIsBranchesOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-sidebar-accent/50 rounded-md">
                <div className="flex items-center gap-2">
                  {isBranchesOpen ? (
                    <IconChevronDown className="h-4 w-4" />
                  ) : (
                    <IconChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-medium text-sm">Branches</span>
                  <Badge variant="secondary" className="text-xs">
                    {branches.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-1 ml-2 mt-2 max-w-62">
                  {localBranches.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium px-2">
                        LOCAL ({localBranches.length})
                      </div>
                      {localBranches.map((branch) => (
                        <BranchItem key={branch.name} branch={branch} />
                      ))}
                    </div>
                  )}
                  
                  {remoteBranches.length > 0 && (
                    <div className="space-y-1">
                      {localBranches.length > 0 && <Separator className="my-2" />}
                      <div className="text-xs text-muted-foreground font-medium px-2">
                        REMOTE ({remoteBranches.length})
                      </div>
                      {remoteBranches.map((branch) => (
                        <BranchItem key={branch.name} branch={branch} />
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Commits Section */}
            <Collapsible open={isCommitsOpen} onOpenChange={setIsCommitsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-sidebar-accent/50 rounded-md">
                <div className="flex items-center gap-2">
                  {isCommitsOpen ? (
                    <IconChevronDown className="h-4 w-4" />
                  ) : (
                    <IconChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-medium text-sm">Commits</span>
                  <Badge variant="secondary" className="text-xs">
                    {commits.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-2 mt-2">
                  {commits.length > 0 ? (
                    commits.map((commit) => (
                      <CommitItem key={commit.id} commit={commit} />
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      No commits found
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
      </SidebarGroupContent>
    </>
  );
} 