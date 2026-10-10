// Body size caps for text-payload routes (memory files, prompts).
//
// Here rather than in `services/infra/paths.ts`, where they used to live: that
// module imports `node:fs`/`node:os`/`node:path`/`node:url`, and
// `packages/api-contract/src/schemas.ts` needs MAX_PROMPT_BYTES. The moment a
// client component imports a schema from there, webpack has to bundle `paths`
// for the browser and the build fails with `UnhandledSchemeError: Reading from
// "node:fs" is not handled by plugins`. Plain constants belong in `config/`
// anyway — see docs/architecture.md.
export const MAX_MEMORY_BYTES = 256 * 1024;
export const MAX_PROMPT_BYTES = 100 * 1024;
