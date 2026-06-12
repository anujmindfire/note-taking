import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

// Load .env.test for integration tests when it exists
config({ path: path.resolve(__dirname, "../../.env.test"), override: false });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@noteapp/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
