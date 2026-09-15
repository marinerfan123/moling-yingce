import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    proxy: {
      "/v1": { target: process.env["API_ORIGIN"] ?? "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
  test: { environment: "jsdom" },
});
