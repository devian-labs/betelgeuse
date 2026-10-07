import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// `tauri ios dev` / `tauri android dev` on a real device set this to the computer's LAN address.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // The editor, databases and styles are shared with the desktop app (until they move to packages/ui).
    alias: { "@desktop": fileURLToPath(new URL("../desktop/src", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1431 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: [".."] },
  },
});
