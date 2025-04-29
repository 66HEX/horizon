import { IconX, IconFileText } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { useFileContext } from "@/lib/file-context"
import { Tabs, TabsList, TabsTrigger } from "./tabs"

export function FileSelectionTabs() {
  const { openFiles, activeFilePath, switchToFile, closeFile } = useFileContext();

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex h-10 items-center gap-1 px-2">
      <Tabs value={activeFilePath || undefined} className="w-full">
        <TabsList className="h-8 w-fit flex gap-1 bg-transparent p-0">
          {openFiles.map((file) => {
            const isActive = file.path === activeFilePath;
            return (
              <TabsTrigger
                key={file.path}
                value={file.path}
                className={cn(
                  "group relative flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm transition-colors",
                  "data-[state=active]:bg-sidebar-accent/20 data-[state=active]:text-foreground",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-sidebar-accent/10",
                  "border border-sidebar-border/20"
                )}
                onClick={() => switchToFile(file.path)}
              >
                <div className="flex items-center gap-1">
                  <IconFileText className="h-4 w-4" />
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  {file.isUnsaved && (
                    <span className="ml-2 text-yellow-500">*</span>
                  )}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Close tab"
                  className={cn(
                    "ml-1 rounded-sm p-1 transition-opacity cursor-pointer",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    "hover:bg-sidebar-accent/20"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      closeFile(file.path);
                    }
                  }}
                >
                  <IconX className="h-4 w-4" />
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
} 