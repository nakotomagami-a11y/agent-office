import { defineConfig } from "vitest/config";
import path from "path";

const sharedSrc = path.resolve(__dirname, "../../packages/domain/src");

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: [
      // Must appear before the generic @agent-office/domain alias so the
      // subpath import wins when the full path is specified.
      {
        find: /^@agent-office\/shared\/(.+)$/,
        replacement: `${sharedSrc}/$1.ts`,
      },
      // Subpath imports (e.g. @agent-office/domain/services/runs/reset-time)
      // must resolve to their source file before the generic package alias.
      {
        find: /^@agent-office\/domain\/(.+)$/,
        replacement: `${sharedSrc}/$1.ts`,
      },
      {
        find: "@agent-office/domain",
        replacement: path.join(sharedSrc, "index.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
});
