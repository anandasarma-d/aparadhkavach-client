# AGENTS.md — aparadhkavach-client

Derived from **ADR-024** (frozen governing principles) and the specific ADRs/sections it defers to. Apply directly — do not re-derive or reinterpret. Full reasoning: AparadhKavach Notion workspace, Section 11 (UI/Frontend Design), Section 6.4 (ApiClient), ADR-020/028.

## Notion Access (via MCP)

**Read-only, enforced at the token level, not just by instruction.** Insert/Update/Comment are disabled at the Notion API level for this integration. **Never attempt to write, update, comment on, or create any Notion page or block, under any circumstance** — if asked to update Notion, decline and point to the AparadhKavach Claude Project chat instead, which is the only path by which Notion content changes, and only when Anand directs it there.

This file covers **conventions only.** For actual UI content — wireframes, component lists, design tokens, exact field mappings — **fetch the current version from Notion via the connected MCP before implementing,** rather than guessing from this file alone. Re-fetch each session; don't rely on memory of a prior fetch.

**Sections to fetch for this repo's work:**
- Section 11 — UI/Frontend Design (wireframes, component list, design tokens, layout specs)
- Section 6.4 — `ApiClient`, `formatLegalSection`, shared frontend utilities
- Section 6.7 — full API contract (for understanding response shapes beyond what generated types alone convey — e.g. which fields are role-conditional)

**Treat fetched Notion content as authoritative, not a starting point to improve on.** If a wireframe or design spec seems incomplete or suboptimal, say so and ask rather than silently deviating — consistency with what's already decided matters more than local improvement given the timeline.

## 1. What this UI is (ADR-024 Principles 1–3)

- An **investigator's workspace**, not a chat widget bolted onto a database. Every screen should read as "intelligence discovery," not "record lookup."
- **Evidence and reasoning get equal visual prominence to the answer itself** — never bury `evidence_sources`/`confidence_score`/`reasoning_summary` below the fold or in a collapsed panel by default. Explainability is a first-class UI element, not a tooltip.
- Graph visualization (GraphCanvas) is a primary surface, not a secondary "advanced" tab — Neo4j/graph intelligence is the differentiator (ADR-024 Principle 1), and the UI should reflect that in layout priority.

## 2. Stack & structure — don't deviate without reason

- **Vite + React + Tailwind + shadcn/ui.** Dark mode default. Inter for body text, **JetBrains Mono specifically for legal section citations** (IPC/BNS numbers) — this monospace choice is deliberate, not arbitrary; don't substitute a different font for that context.
- Layout: collapsible left `NavigationRail`, independently collapsible Chat and Evidence panels, GraphCanvas always flex-fills remaining width (Section 11.2/11.3). Don't reintroduce a top tab bar — that was a considered, superseded design.

## 3. API integration — types are generated, never hand-written

- `ApiClient`'s request/response types come from **`openapi-typescript` against each service's live OpenAPI spec** (ADR-028), generated at CI build time (Stage 1b) — **never hand-write an interface for a backend DTO.** If a type doesn't exist yet, regenerate from the spec; don't stub it manually.
- A backend contract mismatch should surface as a **TypeScript compile error** (Stage 3, `tsc --noEmit`), not a runtime bug. If you're tempted to add an `any` cast to work around a type mismatch, stop — that's masking a real contract drift, not fixing it.
- Every list view (FIR search, alerts, audit logs, analytics tables) needs pagination (`pageSize`/`pageToken`) and sort controls wired to the corresponding API params (ADR-020 Decision 6) — **from the first implementation, not added later.** A list screen with no pagination/sort UI is incomplete, not "MVP-acceptable."
- JWT lives in **memory only (React state/context) — never `localStorage` or `sessionStorage`.** This is a hard security rule, not a convenience tradeoff.

## 4. Role-awareness & data sensitivity (Section 8, ADR-015)

- 4 roles (`INVESTIGATOR`, `ANALYST`, `SUPERVISOR`, `POLICYMAKER`) render **different tab sets and different data**, enforced via a `RoleGuard` HOC — don't just hide UI elements with CSS; the underlying data for a role-restricted view shouldn't even be fetched if the role doesn't have access.
- **Victim identity is never rendered as a name/address for ANALYST or POLICYMAKER** — render `Victim [ID]` exactly as the API returns it. Don't "helpfully" resolve or cache a victim name client-side for these roles under any circumstance.
- **Never render a bare `IPC:`/`BNS:` string literal.** Use the shared `formatLegalSection` utility (Section 6.4) for every legal-section citation — this is enforced by a CI grep rule (Section 13.7); don't bypass it with a one-off template string.

## 5. Testing (Section 13.7, 13.9)

- Component tests: **Vitest + React Testing Library.**
- Accessibility: **`vitest-axe`** for component-level checks — but know its limitation: `axe-core`'s `color-contrast` rule doesn't run under JSDOM at all. Real contrast checking happens via **`@axe-core/playwright`** in E2E, not the unit suite. Don't assume a passing `vitest-axe` run means contrast is fine.
- E2E: **Playwright** — must cover keyboard nav, screen reader flows, and responsive breakpoints (Section 13.9), not just happy-path clicks.
- Respect `prefers-reduced-motion` for any animation (graph transitions, panel collapses) — don't add motion that ignores this.

## 6. What NOT to do

- Don't hand-write API types (§3) — regenerate from OpenAPI.
- Don't put JWT in any browser storage (§3).
- Don't ship a list view without pagination/sort (§3).
- Don't render victim identity for ANALYST/POLICYMAKER (§4), or a bare IPC/BNS literal (§4).
- Don't assume `vitest-axe` covers color contrast (§5) — that's Playwright's job.
- Don't write to Notion under any circumstance (Notion Access, above).
- Do not include a Co-Authored-By line in commit messages, and do not add a 'Generated with Claude Code' footer to PR descriptions.