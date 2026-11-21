import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Project is served from https://vidhanth13.github.io/sa-auto-market/ on GitHub Pages,
// so the production base path is /sa-auto-market/. Dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/sa-auto-market/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5273 },
}));
