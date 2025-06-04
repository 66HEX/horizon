import { useEffect, useState, useMemo } from "react";
import { SidebarGroupLabel, SidebarGroupContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const displayName = branch.is_remote 
    ? branch.name.replace('origin/', '') 
    : branch.name;
    
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-sidebar-accent/50 ${
      branch.is_current ? 'bg-sidebar-accent/30 font-medium' : ''
    }`}>
      <IconGitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="flex-1 truncate" title={branch.name}>{displayName}</span>
      <div className="flex gap-1 shrink-0">
        {branch.is_current && (
          <span className="text-[10px] text-muted-foreground/70">Local</span>
        )}
        {branch.is_remote && (
          <span className="text-[10px] text-muted-foreground/70">Remote</span>
        )}
      </div>
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
    
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className="px-2 py-1">
      <div 
        className="flex items-start gap-1.5 p-1.5 pb-3 rounded text-xs hover:bg-sidebar-accent/50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <IconGitCommit className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-muted-foreground">{commit.short_id}</span>
            <span className="text-[10px] text-muted-foreground">{formatRelativeTime(commit.timestamp)}</span>
          </div>
          <p className="text-xs leading-tight line-clamp-2 mb-1" title={commit.message}>
            {commit.message}
          </p>
          {isExpanded && (
            <div className="space-y-1 mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1">
                <IconUser className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground truncate">{commit.author_name}</span>
              </div>
              <div className="flex items-center gap-1">
                <IconCalendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{commit.date}</span>
              </div>
            </div>
          )}
        </div>
        <div className="shrink-0">
          {isExpanded ? (
            <IconChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <IconChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
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
          <div className="flex flex-col items-center justify-center h-full px-4 text-center text-muted-foreground">
            <IconFolder className="h-6 w-6 mb-2" />
            <p className="text-xs mb-1">No folder opened</p>
            <p className="text-[10px] text-muted-foreground/70">Open a folder to see git info</p>
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
          <div className="flex flex-col items-center justify-center h-full px-4 text-center text-muted-foreground">
            <IconGitBranch className="h-6 w-6 mb-2" />
            <p className="text-xs mb-1">Not a git repository</p>
            <p className="text-[10px] text-muted-foreground/70">Initialize git to see info</p>
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
        <ScrollArea className="h-full w-full max-h-[calc(100vh-50px)]" type="auto" scrollHideDelay={400}>
          <div className="space-y-3 p-2">
            {error && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                <IconAlertCircle className="h-3 w-3 shrink-0" />
                <span className="flex-1 text-[10px]">{error}</span>
              </div>
            )}

            {status && (
              <div className="px-2 py-2 rounded-md bg-sidebar-accent/20">
                <div className="flex items-center gap-2">
                  <IconGitBranch className="h-3 w-3 text-blue-500 shrink-0" />
                  <span className="font-medium text-xs truncate" title={status.current_branch || 'HEAD detached'}>
                    {status.current_branch || 'HEAD detached'}
                  </span>
                  {status.has_changes && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      •
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <Collapsible open={isBranchesOpen} onOpenChange={setIsBranchesOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1 hover:bg-sidebar-accent/50 rounded">
                <div className="flex items-center gap-1.5">
                  {isBranchesOpen ? (
                    <IconChevronDown className="h-3 w-3" />
                  ) : (
                    <IconChevronRight className="h-3 w-3" />
                  )}
                  <span className="font-medium text-xs">Branches</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {branches.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1">
                  {localBranches.length > 0 && (
                    <div className="space-y-0.5">
                      {localBranches.map((branch) => (
                        <BranchItem key={branch.name} branch={branch} />
                      ))}
                    </div>
                  )}
                  
                  {remoteBranches.length > 0 && (
                    <div className="space-y-0.5 mt-2">
                      {remoteBranches.map((branch) => (
                        <BranchItem key={branch.name} branch={branch} />
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={isCommitsOpen} onOpenChange={setIsCommitsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1 hover:bg-sidebar-accent/50 rounded">
                <div className="flex items-center gap-1.5">
                  {isCommitsOpen ? (
                    <IconChevronDown className="h-3 w-3" />
                  ) : (
                    <IconChevronRight className="h-3 w-3" />
                  )}
                  <span className="font-medium text-xs">Commits</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {commits.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1">
                  {commits.length > 0 ? (
                    commits.map((commit) => (
                      <CommitItem key={commit.id} commit={commit} />
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground text-xs py-4">
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