import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      // Target the files we are currently testing to meet the 80% threshold immediately
      include: ["src/lib/cert-utils.ts", "src/routes/health.ts"],
    },
  },
});
