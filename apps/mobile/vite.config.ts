import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `tauri ios dev` / `tauri android dev` on a real device set this to the computer's LAN address.
const host = process.env.TAURI_DEV_HOST;

// The release that error reports and usage counts are tagged with (packages/ui/src/lib/telemetry.ts).
process.env.VITE_APP_VERSION = (JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as { version: string }).version;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The editor, databases and styles are shared with the desktop and web apps.
      "@betelgeuse/ui": fileURLToPath(new URL("../../packages/ui/src/", import.meta.url)),
      // Keeps Yjs out of the app: see that stub.
      "@tiptap/y-tiptap": fileURLToPath(new URL("../../packages/ui/src/editor/y-tiptap-stub.ts", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1431 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: ["../.."] },
  },
});
