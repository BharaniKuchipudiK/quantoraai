import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
 * The desktop renderer: a separate Vite app under desktop/renderer, built
 * into desktop/dist/renderer and served by the host on quantora://app.
 * It is not the website. It shares pure logic from shared/ and src/lib via
 * the aliases below, never components or pages.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const outDir = path.resolve(here, "dist/renderer");

function copyMonacoAssets() {
  return {
    name: "copy-monaco-assets",
    closeBundle() {
      const source = path.resolve(repoRoot, "node_modules/monaco-editor/min/vs");
      mkdirSync(path.join(outDir, "monaco"), { recursive: true });
      cpSync(source, path.join(outDir, "monaco/vs"), { recursive: true });
    },
  };
}

export default defineConfig({
  root: path.resolve(here, "renderer"),
  base: "/",
  plugins: [react(), copyMonacoAssets()],
  resolve: {
    alias: {
      "@shared": path.resolve(repoRoot, "shared"),
      "@web": path.resolve(repoRoot, "src"),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: "chrome130",
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
