# Backlog BK-017 Markdown Compaction and Context-Window Guardrails Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-017` (Markdown compaction and context-window guardrails)

## Implemented Capabilities
1. Docs freshness contract hardening for growth control
- Extended `npm run docs:freshness` script:
  - `scripts/docs-freshness-audit.js`
- Added deterministic check IDs:
  - `DF-005` markdown line-count budgets (`README.md`, `AGENTS.md`, `ROADMAP.md`, `docs/roadmap/active-handoff.md`)
  - `DF-006` required compaction assets/references (`docs/roadmap/active-handoff.md`, `docs/roadmap/archive/README.md`, source-doc links)
- Added additive policy flags:
  - `--max-readme-lines`, `--max-agents-lines`, `--max-roadmap-lines`, `--max-handoff-lines`
  - `--handoff`, `--archive-index`

2. Fixture-backed regression expansion
- Updated tests:
  - `packages/cli/src/docs-freshness-audit.test.ts`
- Added/updated fixtures:
  - `tests/fixtures/docs-freshness/HANDOFF.compliant.md`
  - `tests/fixtures/docs-freshness/ARCHIVE-README.compliant.md`
  - plus compliant/stale/missing-command source fixtures
- Added fail scenarios:
  - size-budget violation (`DF-005`)
  - missing compaction assets (`DF-006`)

3. Roadmap compaction assets
- Added compact handoff doc:
  - `docs/roadmap/active-handoff.md`
- Added archive index:
  - `docs/roadmap/archive/README.md`
- Added archived execution-artifact listing:
  - `docs/roadmap/archive/active-execution-artifacts-through-bk-016.md`
- Compacted `ROADMAP.md` by replacing heavyweight inline artifact listing with archive links.

4. Policy convergence
- Updated:
  - `ROADMAP.md` (`BK-017` closure, compaction links, status references)
  - `AGENTS.md` (compaction convention + compact source-of-truth reference)
  - `README.md` (active handoff reference)

## Validation Evidence
- `npm run docs:freshness -- --report ./logs/docs_freshness/report.json --today 2026-02-12` -> PASS
- `npm run test:run -- packages/cli/src/docs-freshness-audit.test.ts` -> PASS
- `npm run typecheck` -> PASS
- `npm run lint` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-plan.md`](../plans/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-plan.md)
- Review: [`docs/reviews/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-review.md`](../reviews/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-review.md)
- Solution: [`docs/solutions/markdown-compaction-and-context-window-guardrails.md`](../solutions/markdown-compaction-and-context-window-guardrails.md)

## Exit Criteria
- Markdown growth is fail-closed bounded by deterministic budget checks.
- Compact handoff/archive assets are required and validated.
- Primary roadmap remains compact while history is preserved in archive docs.
