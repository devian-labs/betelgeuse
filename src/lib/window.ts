import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

/** Whether the window is fullscreen, where macOS hides the traffic-light buttons. */
export function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    let win: ReturnType<typeof getCurrentWindow>;
    try {
      win = getCurrentWindow();
    } catch {
      return; // not running inside Tauri
    }
    const check = () => win.isFullscreen().then(setFullscreen).catch(() => {});
    check();
    // Entering or leaving fullscreen resizes the window.
    const unlisten = win.onResized(check).catch(() => () => {});
    return () => void unlisten.then((f) => f());
  }, []);
  return fullscreen;
}
