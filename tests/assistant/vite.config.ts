import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Deliberately do not import server/index or the application's Vite plugins:
// this harness has no database, schedulers, credentials, or provider clients.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../client/src"),
      "@shared": path.resolve(import.meta.dirname, "../../shared"),
    },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
