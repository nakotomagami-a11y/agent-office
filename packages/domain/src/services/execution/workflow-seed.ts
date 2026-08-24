/**
 * Curated starter workflows.
 *
 * These are the three reusable, high-signal prompts that every fresh install
 * lands with — carefully crafted so they behave well against any codebase.
 * A workflow is just a saved multi-line prompt (title + body + category).
 * The DB table is `saved_prompts` for legacy reasons; on the surface it's
 * exposed as "workflows" everywhere.
 *
 * The migration re-seeds these on version bumps so the app never drifts from
 * the canonical set. User-added workflows are preserved because we only
 * `DELETE ... WHERE category = 'starter'` — everything else stays.
 */

export const STARTER_WORKFLOW_CATEGORY = "starter";

export interface StarterWorkflow {
  slug: string;
  title: string;
  body: string;
}

const REFACTOR_CODEBASE = `Refactor this codebase for maintainability. Work in this order, do not skip steps.

1. Read
   - Start with the repo README and any CLAUDE.md / AGENTS.md — capture stated conventions.
   - Scan the top of the file tree (packages/, apps/, src/, tests/) to understand boundaries.
   - Skim recent commits (\`git log --oneline -30\`) to learn the current direction.

2. Diagnose (do not edit yet)
   Report, with concrete file:line references:
   - Dead code, unused exports, orphaned modules.
   - Duplicate logic that should share a helper.
   - Files > 300 LOC that mix concerns and should be split.
   - Wide \`any\` / \`unknown\` usage, missing return types, silenced type errors.
   - Inconsistent naming, folder conventions, or import paths.
   - Complex functions with high branching depth or unclear responsibility.
   - TODOs / FIXMEs older than 30 days.

3. Prioritize
   Group findings into three buckets:
   - MUST FIX (broken invariants, latent bugs)
   - HIGH VALUE (removes duplication, unblocks future work)
   - NICE TO HAVE (cosmetic, low leverage)
   Do not touch NICE TO HAVE items unless explicitly asked.

4. Apply
   For each MUST FIX and HIGH VALUE item:
   - Make the smallest change that resolves it — surgical, not sweeping.
   - Keep behavior identical unless the item is a correctness bug (call this out).
   - Update or add tests. If no test framework is set up, note it and skip.
   - Run existing linters and typecheckers between changes; do not batch-break-then-fix.

5. Verify
   - Run the full test suite. If tests were already failing, do not claim green.
   - Show a short diff summary per file changed.
   - Flag any behavior changes explicitly so the user can review.

Do not introduce new dependencies, patterns, or abstractions unless justified by two or more current use sites. Prefer deletion over addition. Prefer clarity over cleverness.`;

const SECURITY_SCAN = `Perform a security review of this codebase. Behave like a paranoid reviewer, not a checklist runner — findings must be grounded in real code paths, not category names.

1. Reconnaissance
   - Read the README and CLAUDE.md / AGENTS.md for stated auth model, trust boundaries, secret handling.
   - Identify every network entrypoint: HTTP routes, WebSocket handlers, event listeners, CLI-invoked commands, deserialization paths.
   - Identify every place secrets could live: \`.env*\`, \`config/*\`, \`process.env.*\`, keyring calls, hardcoded strings that look like tokens.

2. Threat surface — check each explicitly and cite the file:line
   AUTHN / AUTHZ
   - Missing auth on privileged routes.
   - IDOR: object references that trust the caller.
   - Role checks done in the UI only.
   - Session tokens in URLs, logs, or client storage without protection.

   INPUT HANDLING
   - Unvalidated request bodies reaching the DB / filesystem / shell.
   - String concatenation into SQL, shell commands, HTML, or regex.
   - \`eval\`, \`Function()\`, \`vm\`, dynamic \`import\` with attacker-controlled input.
   - File paths built from user input without a boundary check.

   OUTPUT / SIDE CHANNELS
   - Errors that leak stack traces, SQL fragments, or file paths to the client.
   - Logs that record secrets, PII, or full request bodies.
   - CORS \`*\` on endpoints that read cookies or auth headers.

   DEPENDENCIES
   - Direct dependencies with known CVEs (\`npm audit\`, \`pnpm audit\`, \`pip-audit\`).
   - Lockfile drift or missing lockfile.
   - Postinstall / prepare scripts from untrusted sources.

   SECRETS
   - Anything resembling an API key, JWT, private key, or password committed to the repo.
   - \`.env\` files checked in.
   - Secrets read from insecure sources (client-side env vars, unencrypted disk).

   AI / LLM SPECIFIC (if applicable)
   - Prompt injection surfaces: user text concatenated into system prompts.
   - Tool-use flows without allowlist / confirmation for destructive tools.
   - Untrusted output rendered as HTML or Markdown without sanitisation.

3. Report
   For every finding, produce:
   - Severity: CRITICAL / HIGH / MEDIUM / LOW
   - File:line
   - Exploit sketch (one paragraph — attacker input → observable impact)
   - Fix recommendation (concrete, not "add validation")
   Sort by severity descending.

4. Do not fix without approval
   Present the report first. Ask which items to remediate. Then apply fixes one severity tier at a time with a short diff per change.`;

const HTML_TO_APP = `Convert the provided HTML/CSS design into a working component in this codebase. Follow the existing stack — do not import new frameworks or design systems.

1. Learn the target
   - Look at 2–3 existing components of similar complexity. Note: styling system (Tailwind classes, CSS modules, styled-components, tokens), component pattern (function vs class, prop conventions), file layout, test conventions.
   - Identify the design token layer (colors, spacing, typography). Do not use raw hex codes or px values that already have a token.

2. Analyze the source
   - Parse the provided HTML into a semantic structure: what is a landmark, a list, a form, a control?
   - List every interactive element and describe its expected behavior. If the design implies state (hover, focus, disabled, loading, error, empty), enumerate all states.
   - List every image / icon / font. Note which already exist in the project vs which need to be added.
   - Note any accessibility gaps in the source (missing labels, low contrast, non-semantic \`<div>\` used as button) — those must be fixed in the conversion, not carried over.

3. Plan
   Before writing code:
   - Choose the component's public shape: props, slots/children, callbacks. Keep it as small as the design allows.
   - Decide what is a single component vs a small sub-tree. Split only when a piece is reused or genuinely independent.
   - Pick the target file paths. Match existing folder conventions exactly.

4. Implement
   - Use existing tokens and utilities. Add new tokens only if the design demonstrably breaks the current scale, and flag it.
   - Layout MUST use Flexbox — no CSS Grid.
   - Every interactive element must be keyboard-reachable and screen-reader-labelled.
   - Use responsive units the codebase already uses (rem/em/%/vh/vw as appropriate). No magic breakpoints — reuse the project's.
   - No inline styles unless the codebase does it. No dead classes copy-pasted from the source HTML.
   - Add a small test if the codebase has a test setup for this layer.

5. Verify
   - Render the component in isolation (Storybook, playground, or route stub) and confirm each state visually.
   - Run lint + typecheck + tests. Green before you claim done.
   - Show a diff summary and screenshots or a short description of what to click through.

Report anything in the source design that could not be honored faithfully (contrast, spacing collision, missing states) rather than silently deviating.`;

export const STARTER_WORKFLOWS: readonly StarterWorkflow[] = [
  {
    slug: "refactor-codebase",
    title: "Refactor codebase",
    body: REFACTOR_CODEBASE,
  },
  {
    slug: "security-vulnerability-scan",
    title: "Security vulnerability scan",
    body: SECURITY_SCAN,
  },
  {
    slug: "html-to-app-conversion",
    title: "HTML design → app component",
    body: HTML_TO_APP,
  },
];
