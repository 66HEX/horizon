import { useEffect, useState, useMemo } from "react";
import { SidebarGroupLabel, SidebarGroupContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { 
  IconGitBranch, 
  IconGitCommit, 
  IconChevronDown, 
  IconChevronRight,
  IconRefresh,
  IconFolder,
  IconAlertCircle,
  IconUser,
  IconCalendar,
  IconPlus,
  IconMinus,
  IconFileText,
  IconEdit,
  IconTrash,
  IconPlusMinus,
  IconCloudUp,
  IconCloudDown,
  IconCloud,
  IconX
} from "@tabler/icons-react";
import { useGitStore, GitBranch, GitCommit, GitFileStatus } from "@/lib/stores/git-store";
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

interface FileStatusItemProps {
  file: GitFileStatus;
  repoPath: string;
  isStaged: boolean;
  onStage: (filePath: string) => void;
  onUnstage: (filePath: string) => void;
}

function FileStatusItem({ file, isStaged, onStage, onUnstage }: FileStatusItemProps) {
  const getStatusIcon = () => {
    switch (file.status) {
      case 'modified': return <IconEdit className="h-3 w-3 text-orange-500" />;
      case 'added': return <IconPlus className="h-3 w-3 text-green-500" />;
      case 'deleted': return <IconTrash className="h-3 w-3 text-red-500" />;
      case 'renamed': return <IconPlusMinus className="h-3 w-3 text-blue-500" />;
      default: return <IconFileText className="h-3 w-3 text-blue-500" />;
    }
  };

  return (
    <div className="flex justify-between items-center gap-1.5 p-2 py-1 rounded text-xs hover:bg-sidebar-accent/50 group">
      {getStatusIcon()}
      <span className="flex-1 truncate text-xs max-w-48" title={file.path}>
        {file.path}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 shrink-0"
        onClick={() => isStaged ? onUnstage(file.path) : onStage(file.path)}
      >
        {isStaged ? (
          <IconMinus className="h-3 w-3" />
        ) : (
          <IconPlus className="h-3 w-3" />
        )}
      </Button>
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
        className="flex items-start gap-1.5 p-1.5 rounded text-xs hover:bg-sidebar-accent/50 cursor-pointer"
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
    changes,
    remoteStatus,
    isLoading, 
    error,
    refreshGitData,
    isGitRepository,
    stageFile,
    unstageFile,
    stageAllFiles,
    commitChanges,
    fetchFromRemote,
    pullFromRemote,
    pushToRemote,
    clearError,
    discardAllChanges
  } = useGitStore();

  const [isBranchesOpen, setIsBranchesOpen] = useState(false);
  const [isCommitsOpen, setIsCommitsOpen] = useState(false);
  const [isChangesOpen, setIsChangesOpen] = useState(false);
  const [isStagedOpen, setIsStagedOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [authorName, setAuthorName] = useState("Your Name");
  const [authorEmail, setAuthorEmail] = useState("your.email@example.com");

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

  const handleStageFile = async (filePath: string) => {
    if (currentDirectory) {
      await stageFile(currentDirectory, filePath);
    }
  };

  const handleUnstageFile = async (filePath: string) => {
    if (currentDirectory) {
      await unstageFile(currentDirectory, filePath);
    }
  };

  const handleStageAll = async () => {
    if (currentDirectory) {
      await stageAllFiles(currentDirectory);
    }
  };

  const handleCommit = async () => {
    if (currentDirectory && commitMessage.trim()) {
      try {
        await commitChanges(currentDirectory, commitMessage.trim(), authorName, authorEmail);
        setCommitMessage("");
      } catch (error) {
        console.error('Failed to commit:', error);
      }
    }
  };

  const handleFetch = async () => {
    if (currentDirectory) {
      try {
        await fetchFromRemote(currentDirectory);
        await refreshGitData(currentDirectory);
      } catch (error) {
        console.error('Failed to fetch:', error);
      }
    }
  };

  const handlePull = async () => {
    if (currentDirectory) {
      try {
        const result = await pullFromRemote(currentDirectory);
        if (result.conflicts.length > 0) {
          console.warn('Pull completed with conflicts:', result.conflicts);
        }
        await refreshGitData(currentDirectory);
      } catch (error) {
        console.error('Failed to pull:', error);
      }
    }
  };

  const handlePush = async () => {
    if (!currentDirectory) return;
    try {
      await pushToRemote(currentDirectory);
    } catch (error) {
      console.error('Failed to push:', error);
    }
  };

  const handleDiscardAll = async () => {
    if (!currentDirectory) return;
    try {
      await discardAllChanges(currentDirectory);
    } catch (error) {
      console.error('Failed to discard changes:', error);
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
              <div className="px-2 py-2 rounded-md bg-sidebar-accent/20 mx-2">
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

            <div className="space-y-2 px-2">
              <Input
                placeholder={
                  changes?.staged.length === 0 
                    ? "Stage changes to commit" 
                    : "Commit message"
                }
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                disabled={changes?.staged.length === 0}
                className="text-xs h-7"
              />
              <Button
                onClick={handleCommit}
                disabled={!commitMessage.trim() || isLoading || changes?.staged.length === 0}
                className="w-full h-7 text-xs"
                size="sm"
              >
                <IconGitCommit className="h-3 w-3 mr-1" />
                Commit {changes?.staged.length ? `(${changes.staged.length})` : ''}
              </Button>
            </div>

            {remoteStatus && remoteStatus.has_remote && (
              <div className="space-y-2">
                <div className="px-2 py-2 rounded-md bg-sidebar-accent/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <IconCloud className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate" title={remoteStatus.remote_url || ''}>
                        {remoteStatus.remote_name}
                      </span>
                    </div>
                    {(remoteStatus.ahead > 0 || remoteStatus.behind > 0) && (
                      <div className="flex gap-1">
                        {remoteStatus.ahead > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600">
                            ↑{remoteStatus.ahead}
                          </Badge>
                        )}
                        {remoteStatus.behind > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600">
                            ↓{remoteStatus.behind}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFetch}
                      disabled={isLoading}
                      className="flex-1 h-6 text-[10px] px-2"
                    >
                      <IconCloud className="h-3 w-3 mr-1" />
                      Fetch
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePull}
                      disabled={isLoading || remoteStatus.behind === 0}
                      className="flex-1 h-6 text-[10px] px-2"
                    >
                      <IconCloudDown className="h-3 w-3 mr-1" />
                      Pull
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePush}
                      disabled={isLoading || remoteStatus.ahead === 0}
                      className="flex-1 h-6 text-[10px] px-2"
                    >
                      <IconCloudUp className="h-3 w-3 mr-1" />
                      Push
                    </Button>
                  </div>
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

            {changes && changes.unstaged.length > 0 && (
              <Collapsible open={isChangesOpen} onOpenChange={setIsChangesOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1 hover:bg-sidebar-accent/50 rounded">
                  <div className="flex items-center gap-1.5">
                    {isChangesOpen ? (
                      <IconChevronDown className="h-3 w-3" />
                    ) : (
                      <IconChevronRight className="h-3 w-3" />
                    )}
                    <span className="font-medium text-xs">Changes</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {changes.unstaged.length}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStageAll();
                      }}
                      title="Stage all changes"
                    >
                      <IconPlus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDiscardAll();
                      }}
                      title="Discard all changes"
                    >
                      <IconX className="h-3 w-3" />
                    </Button>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1 space-y-0.5">
                    {changes.unstaged.map((file) => (
                      <FileStatusItem
                        key={file.path}
                        file={file}
                        repoPath={currentDirectory}
                        isStaged={false}
                        onStage={handleStageFile}
                        onUnstage={handleUnstageFile}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {changes && changes.staged.length > 0 && (
              <Collapsible open={isStagedOpen} onOpenChange={setIsStagedOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 py-1 hover:bg-sidebar-accent/50 rounded">
                  <div className="flex items-center gap-1.5">
                    {isStagedOpen ? (
                      <IconChevronDown className="h-3 w-3" />
                    ) : (
                      <IconChevronRight className="h-3 w-3" />
                    )}
                    <span className="font-medium text-xs">Staged Changes</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {changes.staged.length}
                    </Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1 space-y-0.5">
                    {changes.staged.map((file) => (
                      <FileStatusItem
                        key={file.path}
                        file={file}
                        repoPath={currentDirectory}
                        isStaged={true}
                        onStage={handleStageFile}
                        onUnstage={handleUnstageFile}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

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