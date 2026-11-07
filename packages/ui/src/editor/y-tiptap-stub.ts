/**
 * Stand-in for @tiptap/y-tiptap (Yjs collaboration bindings, ~550 KB with yjs and lib0). The block
 * drag handle imports it only to keep positions stable during real-time collaboration: it asks the
 * sync plugin for its state and, finding none, never calls the rest. Betelgeuse has no live
 * collaboration (git merges instead), so this keeps Yjs out of the app. Aliased in vite.config.ts.
 */
import { PluginKey } from "@tiptap/pm/state";

export const ySyncPluginKey = new PluginKey("y-sync");

const unused = () => {
  throw new Error("Real-time collaboration isn't part of Betelgeuse");
};
export const absolutePositionToRelativePosition = unused;
export const relativePositionToAbsolutePosition = unused;

// Also imported by @tiptap/extension-collaboration, which the drag handle pulls in but the editor
// never adds (so none of these run).
export const yUndoPluginKey = new PluginKey("y-undo");
export const ySyncPlugin = unused;
export const yUndoPlugin = unused;
export const undo = unused;
export const redo = unused;
