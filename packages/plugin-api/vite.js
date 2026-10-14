// Vite setup for Betelgeuse plugins. In a plugin's vite.config.js:
//
//   import { pluginConfig } from "@betelgeuse/plugin-api/vite";
//   export default pluginConfig();
//
// It builds src/main.tsx (or `entry`) into dist/main.js (CommonJS, the format the app loads),
// dist/styles.css if the plugin imports CSS, and copies betelgeuse-plugin.json next to them, so
// dist/ is the installable plugin. React and the plugin API are left out: the app provides them.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Modules the app provides to plugins at run time. */
export const SHARED_MODULES = ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "@betelgeuse/plugin-api", "@betelgeuse/plugin-api/ui"];

export function pluginConfig({ root = process.cwd(), entry = "src/main.tsx", outDir = "dist" } = {}) {
  const manifestPath = resolve(root, "betelgeuse-plugin.json");
  if (!existsSync(manifestPath)) throw new Error(`No betelgeuse-plugin.json in ${root}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id ?? "")) throw new Error(`Plugin id "${manifest.id}" must be lowercase letters, digits and dashes.`);

  return {
    root,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "betelgeuse-plugin-manifest",
        writeBundle() {
          copyFileSync(manifestPath, resolve(root, outDir, "betelgeuse-plugin.json"));
        },
      },
    ],
    define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production") },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: "inline",
      lib: { entry: resolve(root, entry), formats: ["cjs"], fileName: () => "main.js", cssFileName: "styles" },
      rollupOptions: { external: SHARED_MODULES, output: { exports: "named" } },
    },
  };
}
