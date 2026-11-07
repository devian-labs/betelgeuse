import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const ui = (path: string) => fileURLToPath(new URL(`../../packages/ui/src/${path}`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@betelgeuse/ui": ui(""),
      // The drag handle's optional collaboration support would bring in all of Yjs: see the stub.
      "@tiptap/y-tiptap": ui("editor/y-tiptap-stub.ts"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: ["../.."] },
  },
});
