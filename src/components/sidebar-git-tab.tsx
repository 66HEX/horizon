import { SidebarGroupLabel, SidebarGroupContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SidebarGitTab() {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 w-full">
        <div className="flex w-full justify-between items-center gap-2">
          <SidebarGroupLabel className="mb-0">Git Integration</SidebarGroupLabel>
        </div>
      </div>

      <SidebarGroupContent className="relative overflow-hidden h-full">
        <ScrollArea className="absolute inset-0 w-full h-full" type="auto" scrollHideDelay={400}>
          <div className="mt-2 flex flex-col items-center justify-center h-full px-2 text-center text-muted-foreground">
            <p className="mb-2">Git integration coming soon</p>
            <p className="text-xs">This feature will allow you to manage your git repository</p>
          </div>
        </ScrollArea>
      </SidebarGroupContent>
    </>
  );
} 