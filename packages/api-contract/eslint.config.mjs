import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/**
 * Lint config for packages/api-contract — the wire contract every client
 * imports, so it stays pure: zod and domain config/types, nothing with I/O.
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

      // ── Architecture invariants (docs/conventions.md) ──────────
      // Enforced mechanically because a rule that exists only as prose is a
      // rule that gets violated: this one was stated in architecture.md and
      // never checked, which is how project-runtime.ts ended up stranded in
      // apps/web where the prompt assembler cannot reach it.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*","next","next/*","react","node:*","fs","path","os","child_process","better-sqlite3","**/domain/src/services/**","@agent-office/server","@agent-office/server/*","@agent-office/domain/services","@agent-office/domain/services/*"],
              message:
                "RULE arch.contract-pure (docs/conventions.md): packages/api-contract is imported by every client, browser included. Only zod and @agent-office/domain config/types — no services, no node: modules, no app code.",
            },
          ],
        },
      ],

      // RULE arch.parse-dont-cast (docs/conventions.md). `JSON.parse` returns
      // `any`; casting it to a concrete interface is a claim the runtime can
      // break. Validate at the boundary instead.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression:not([typeAnnotation.type='TSUnknownKeyword']) > CallExpression.expression > MemberExpression.callee[property.name='parse'][object.name='JSON']",
          message:
            "RULE arch.parse-dont-cast (docs/conventions.md): never cast JSON.parse() straight to a type — `as SomeShape` is a lie the runtime can break. Take it as `unknown` and narrow it with a Zod schema (or a type guard) before use.",
        },
      ],

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
    rules: { "no-console": "off", "no-restricted-imports": "off" },
  },
];
