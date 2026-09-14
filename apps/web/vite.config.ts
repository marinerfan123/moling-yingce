import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: { entry: "src/main.tsx", formats: ["es"], fileName: "main" },
    rollupOptions: { external: ["react", "react-dom"] },
  },
  test: { environment: "jsdom" },
});
