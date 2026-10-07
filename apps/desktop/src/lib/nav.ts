/** How a page is opened: in the current tab, or (⌘/Ctrl-click, middle-click) in a new one. */
export type OpenOptions = { newTab?: boolean };

/** Whether a click asks for a new tab: ⌘-click on macOS, Ctrl-click elsewhere, or a middle-click. */
export const wantsNewTab = (e: { metaKey: boolean; ctrlKey: boolean; button?: number }) => e.metaKey || e.ctrlKey || e.button === 1;
