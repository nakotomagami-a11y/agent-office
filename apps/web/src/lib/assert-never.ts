/**
 * Compile-time exhaustiveness check for `switch` statements over a
 * discriminated union — the plain-JS replacement for ts-pattern's
 * `.exhaustive()`. Put this in the `default:` case; if a union member isn't
 * handled by an earlier `case`, `value` won't narrow to `never` and
 * TypeScript flags the call site, not just a silent runtime fallthrough.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
