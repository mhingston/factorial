---
title: "Replay manifest summary and diff command"
category: "process"
tags:
  - "replay"
  - "provenance"
  - "debugging"
date: "2026-02-11"
trigger: "BK-001 required better incident debugging ergonomics for replay/provenance analysis."
---

# Problem
`run_manifest.json` contains replay-critical and provenance metadata, but manual inspection is slow and error-prone during incidents. There was no deterministic CLI UX for summary or diff workflows.

# Solution Pattern
Add a first-class CLI command (`factorial manifest`) that:
- summarizes replay/provenance signals from one manifest, and
- optionally compares two manifests on replay-focused fields (`graph`, replay profile, node statuses, provenance by node).

Support both human-readable output and machine-readable JSON for tooling.

# Key Insight
Replay debugging improves most when the UX compares normalized control-plane fields (status flow and provenance identity), not raw artifact paths that naturally vary per run.

# Implementation References
- Files touched:
  - `packages/cli/src/index.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
  - `README.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/e2e-smoke.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-001-replay-provenance-ux-batch-1-plan.md`
  - `docs/reviews/bk-001-replay-provenance-ux-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run -- packages/cli/src/e2e-smoke.test.ts`
  - `npm run test:run`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - No `AGENTS.md` update required; existing guidance already mandates deterministic artifacts and bounded verification.

# Reuse Guidance
- When to apply this pattern:
  - Any feature that needs fast debugging across `run` and `replay` flows without changing manifest schema.
- When not to apply:
  - If comparisons must include full artifact path parity; those are expected to differ across runs.
- Known tradeoffs:
  - The diff intentionally ignores path-level artifact drift in favor of replay/provenance signal parity.
