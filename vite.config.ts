import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Loaded only when exporting an animation or saving a project: bundled up front, or
  // Vite reloads the page the first time one is reached for.
  optimizeDeps: {
    include: ["mediabunny", "gifenc", "fflate"],
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    // Tauri's devUrl is fixed, so fail rather than drift to another port.
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          konva: ["konva", "react-konva"],
        },
      },
    },
  },
  clearScreen: false,
});
