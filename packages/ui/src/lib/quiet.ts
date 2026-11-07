/**
 * Saves that only change a page's text (typing in the editor) don't change anything the rest of
 * the app shows: not the page list, the sidebar, properties or database views. The editor marks
 * them "quiet", so the file-change event they cause doesn't make the whole app reload while
 * someone types; one catch-up refresh follows once they pause.
 */
const quiet = new Map<string, number>();
const WINDOW = 3000;

export function markQuietWrite(path: string) {
  quiet.set(path, Date.now() + WINDOW);
}

/** Whether a change to this workspace path came from a recent quiet save. */
export function isQuietWrite(path: string) {
  const until = quiet.get(path);
  if (until === undefined) return false;
  if (until < Date.now()) {
    quiet.delete(path);
    return false;
  }
  return true;
}
