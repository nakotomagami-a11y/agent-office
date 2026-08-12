/**
 * Node ESM resolves relative specifiers literally, but this package is written
 * for a bundler ("./paths", not "./paths.ts"). This hook retries with a .ts
 * extension so plain `node` can execute the service sources directly:
 *
 *   node --import ./packages/domain/src/services/ts-resolve-hook.mjs some.test.ts
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

if (!process.env.__TS_RESOLVE_HOOK_REGISTERED) {
  process.env.__TS_RESOLVE_HOOK_REGISTERED = "1";
  register(pathToFileURL(import.meta.filename));
}

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw err;
  }
}
