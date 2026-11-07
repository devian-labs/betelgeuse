import { useEffect, useState } from "react";
import { platform } from "../platform";

/**
 * Whether the window's own controls are out of the way: macOS hides its traffic lights in fullscreen,
 * and a browser tab has none to make room for.
 */
export function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(() => !platform().features.windowControls);
  useEffect(() => platform().watchFullscreen?.(setFullscreen), []);
  return fullscreen;
}
