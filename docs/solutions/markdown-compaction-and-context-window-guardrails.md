---
title: "Markdown compaction and context-window guardrails"
category: "process"
tags:
  - "docs-freshness"
  - "compaction"
  - "context-window"
date: "2026-02-12"
trigger: "BK-017 required deterministic controls against unbounded markdown growth and context exhaustion."
---

# Problem
Source-of-truth markdown docs can grow indefinitely, increasing prompt/context load and reducing reliability of agent startup and review loops.

# Solution Pattern
Extend the docs freshness contract with explicit line-count budgets and compaction-asset checks, then maintain a compact active handoff doc plus archive-backed history so primary roadmap context stays bounded.

# Key Insight
Context reliability improves when “document hygiene” is enforced like runtime contracts: explicit thresholds, deterministic checks, fail-closed CI behavior, and archive links instead of append-only growth.

# Implementation References
- Files touched:
  - `scripts/docs-freshness-audit.js`
  - `packages/cli/src/docs-freshness-audit.test.ts`
  - `tests/fixtures/docs-freshness/AGENTS.compliant.md`
  - `tests/fixtures/docs-freshness/ROADMAP.compliant.md`
  - `tests/fixtures/docs-freshness/ROADMAP.stale.md`
  - `tests/fixtures/docs-freshness/HANDOFF.compliant.md`
  - `tests/fixtures/docs-freshness/ARCHIVE-README.compliant.md`
  - `docs/roadmap/active-handoff.md`
  - `docs/roadmap/archive/README.md`
  - `docs/roadmap/archive/active-execution-artifacts-through-bk-016.md`
  - `ROADMAP.md`
  - `AGENTS.md`
  - `README.md`
- Tests added/updated:
  - `packages/cli/src/docs-freshness-audit.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-plan.md`
  - `docs/reviews/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `docs_freshness_report.v1` now enforces `DF-005` (line-count budgets) and `DF-006` (compaction assets/references).
  - Test coverage includes compliant pass, command drift fail, roadmap freshness fail, size-budget fail, and missing-compaction-asset fail.
- What validated reliability over time:
  - `npm run docs:freshness -- --report ./logs/docs_freshness/report.json --today 2026-02-12`
  - `npm run test:run -- packages/cli/src/docs-freshness-audit.test.ts`
  - `npm run typecheck`
  - `npm run lint`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` conventions/reference docs now include compact handoff + archive compaction guidance.

# Reuse Guidance
- When to apply this pattern:
  - Long-running repos where primary planning docs become append-only and are repeatedly loaded into agent context.
- When not to apply:
  - Small repos with single-purpose docs and no recurring multi-file planning history.
- Known tradeoffs:
  - Line-count budgets are coarse; occasional policy tuning is needed as repo complexity evolves.
