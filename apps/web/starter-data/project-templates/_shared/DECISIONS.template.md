# Decisions log

Architectural Decision Records for {{PROJECT_NAME}}. Append-only. Each ADR captures a real fork in the road, why one path was chosen, and what to revisit if the assumption breaks.

Format: `## ADR-NNN: <title>` then `Status`, `Context`, `Decision`, `Consequences`. Keep them short. Bullet points are fine.

---

## ADR-001: Stack baseline

- **Status**: Accepted ({{DATE}})
- **Context**: Project bootstrapped from agent-office templates. Stack: {{FRONTEND}} on the frontend, {{BACKEND}} on the backend.
- **Decision**: Use the prescribed stack as-is. Override only when a real constraint surfaces.
- **Consequences**: Conventions in `ARCHITECTURE.md` and `docs/` apply unchanged. Any deviation must produce a new ADR.

---

<!-- Add new ADRs above this line. Never edit a past ADR - supersede it with a new one. -->
