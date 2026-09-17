/**
 * SQLite data layer. Split by concern into sibling files; this barrel re-exports
 * the public surface so the `db.*` namespace (see services/index.ts:
 * `export * as db from "./db"`) stays identical to when this was one file.
 *
 * `migrations.ts` is intentionally NOT re-exported — `createSchema` is
 * internal to `getDb()` and must not leak into `db.*`.
 */
export * from "./connection";
export * from "./runs";
export * from "./conversations";
export * from "./scheduled-jobs";
export * from "./messages";
export * from "./transcripts";
export * from "./ui-settings";
export * from "./pipelines";
export * from "./workflows";
export * from "./background-shells";
export * from "./agent-context-measurements";
