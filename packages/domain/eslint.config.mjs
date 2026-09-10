import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/**
 * Lint config for the backend domain package — the TypeScript subset of
 * apps/web/eslint.config.mjs (no React/Next plugins; this package is
 * framework-agnostic by design, see docs/architecture.md).
 */
export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // ── TypeScript strictness ──────────────────────────────────
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // ── Runtime hygiene ────────────────────────────────────────
      // Services log through infra/log; bare console is dev-cruft.
      "no-console": ["error", { allow: ["warn", "error"] }],

      // ── Complexity budgets (warn-only, same as apps/web) ───────
      "max-lines": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
      "max-depth": ["warn", 3],
      "max-params": ["warn", 5],
    },
  },
  {
    // Hand-run tsx test scripts report via console by design.
    files: ["src/**/*.test.ts"],
    rules: { "no-console": "off" },
  },
];
