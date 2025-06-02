import { useEffect } from "react";

export function useTauriDragRegion() {
  useEffect(() => {
    if (document.querySelector("[data-tauri-drag-region]")) return;

    const dragRegionDiv = document.createElement("div");
    dragRegionDiv.setAttribute("data-tauri-drag-region", "");
    dragRegionDiv.className = "dragble-state";
    document.body.appendChild(dragRegionDiv);
  }, []);
}
