import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/v1": { target: process.env["API_ORIGIN"] ?? "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
  build: {
    lib: { entry: "src/main.tsx", formats: ["es"], fileName: "main" },
    rollupOptions: { external: ["react", "react-dom"] },
  },
  test: { environment: "jsdom" },
});
