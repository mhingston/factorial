# AGENTS.md

## Project Overview
Factorial is a DOT-based workflow runner for multi-stage AI pipelines.
The system is core-preserving: reliability and operating model improvements should not rewrite the graph
execution engine.

## Stack
- TypeScript (Node.js, ESM)
- Vitest for tests
- Biome for linting
- Graph workflows defined in DOT

## Core Commands
- `npm install`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:golden`
- `npm run agent:audit`
- `npm run check:pr-compound`
- `npm run metrics:compound-weekly -- --start YYYY-MM-DD --end YYYY-MM-DD`

## Mandatory Engineering Loop (Feature Work)
1. Create a plan artifact from `docs/templates/plan.md`.
2. Implement changes scoped to selected issue IDs.
3. Produce structured review findings using `docs/templates/review.md`.
4. Synthesize a bounded issue batch (high-impact items only).
5. Verify selected issue IDs only, with `pass|fail` evidence per issue.
6. Apply consensus lock decision (`resolved` or `reopen`).
7. Record reusable learning in `docs/solutions/*.md` using `docs/templates/compound.md`.
8. Update this file when a new reusable pattern should become default guidance.

Ratchet rule: no new critique is added until the active batch reaches `resolved`.

## Conventions
- Keep changes deterministic and CI-friendly.
- Prefer strict schemas and explicit pass/fail routing for workflow quality controls.
- For PR-bound feature work, ensure the PR body passes `npm run check:pr-compound` (plan/review/compound links + lock decision + ratchet reference).
- Publish one weekly compound metrics report under `docs/metrics/reports/` using `npm run metrics:compound-weekly`.
- For new runtime adapters (including DTU work), define contract schema + in-memory boundary + fixture parity checks before adding external integration layers.
- Use file and line references for review findings.
- Prioritize reliability, security, correctness, and major performance issues over style.

## Common Mistakes
- Introducing new findings during batch verification.
- Mixing in style-only feedback during convergence batches.
- Leaving high-risk changes without explicit invariants in the plan.
- Creating solution docs without linking affected files/tests and trigger context.

## Reference Docs
- PRD: `docs/plans/compound-engineering-operating-system-prd.md`
- Templates:
  - `docs/templates/plan.md`
  - `docs/templates/review.md`
  - `docs/templates/compound.md`
- Knowledge base:
  - `docs/solutions/README.md`
  - `docs/solutions/*.md`
  - `docs/solutions/example-fastify-raw-body-webhooks.md`
- Metrics:
  - `docs/metrics/compound-rate.md`
