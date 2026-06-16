import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load root .env so PORT matches whatever the backend uses
  const env = loadEnv(mode, path.resolve(__dirname, "../../"), "");
  const backendPort = env["PORT"] ?? "3000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@noteapp/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
    },
    server: {
      proxy: {
        "/api": `http://localhost:${backendPort}`,
      },
    },
  };
});
