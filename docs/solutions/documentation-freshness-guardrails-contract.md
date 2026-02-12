---
title: "Documentation freshness guardrails contract"
category: "process"
tags:
  - "docs-freshness"
  - "compound-loop"
  - "fail-closed"
date: "2026-02-12"
trigger: "BK-016 required deterministic enforcement for docs command-surface/backlog-direction drift."
---

# Problem
Repository operating docs could drift from executable command surface and active backlog declarations, with no deterministic fail-closed gate to block stale or contradictory guidance.

# Solution Pattern
Add a dedicated docs freshness audit contract (`docs_freshness_report.v1`) that parses source-of-truth docs (`README.md`, `AGENTS.md`, `ROADMAP.md`, `package.json`), enforces explicit drift checks, publishes a structured report, and exits non-zero on any required check failure.

# Key Insight
Documentation reliability improves when high-value narrative claims (commands, backlog direction, freshness markers) are converted into machine-validated invariants with explicit check IDs and CI publication.

# Implementation References
- Files touched:
  - `scripts/docs-freshness-audit.js`
  - `packages/cli/src/docs-freshness-audit.test.ts`
  - `tests/fixtures/docs-freshness/README.compliant.md`
  - `tests/fixtures/docs-freshness/README.missing-command.md`
  - `tests/fixtures/docs-freshness/AGENTS.compliant.md`
  - `tests/fixtures/docs-freshness/ROADMAP.compliant.md`
  - `tests/fixtures/docs-freshness/ROADMAP.stale.md`
  - `tests/fixtures/docs-freshness/package.compliant.json`
  - `.github/workflows/ci.yml`
  - `package.json`
  - `README.md`
  - `AGENTS.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/docs-freshness-audit.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-016-documentation-freshness-guardrails-batch-1-plan.md`
  - `docs/reviews/bk-016-documentation-freshness-guardrails-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `docs_freshness_report.v1` includes deterministic checks `DF-001..DF-004` for source readability, command parity, roadmap freshness, and backlog-direction consistency.
  - Fixture-based tests cover compliant pass and fail-closed drift scenarios.
- What validated reliability over time:
  - `npm run docs:freshness -- --report ./logs/docs_freshness/report.json --today 2026-02-12`
  - `npm run test:run -- packages/cli/src/docs-freshness-audit.test.ts`
  - `npm run typecheck`
  - `npm run lint`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` core commands/conventions/backlog direction now include docs freshness enforcement.

# Reuse Guidance
- When to apply this pattern:
  - When multiple docs declare operational contracts that must stay synchronized with executable repository behavior.
- When not to apply:
  - Single-file docs with no cross-document command/status coupling.
- Known tradeoffs:
  - Text-parsing checks are intentionally scoped to explicit anchor patterns; structural doc rewrites may require parser updates.
