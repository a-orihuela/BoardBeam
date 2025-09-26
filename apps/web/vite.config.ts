// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: "/tmp/vite",
  optimizeDeps: { force: true },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: { host: "localhost", protocol: "ws", port: 5173 },
    watch: { usePolling: true },
    proxy: {
      // proxy dev → backend (evita CORS y puertos cruzados)
      "/admin": { target: "http://localhost:8080", changeOrigin: true },
      "/healthz": { target: "http://localhost:8080", changeOrigin: true }
    }
  },
  preview: { host: true, port: 5173 }
});
