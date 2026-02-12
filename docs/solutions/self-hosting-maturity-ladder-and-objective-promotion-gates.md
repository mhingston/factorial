---
title: "Self-hosting maturity ladder and objective promotion gates"
category: "process"
tags:
  - "self-host"
  - "maturity-gates"
  - "ci-governance"
date: "2026-02-11"
trigger: "BK-006 required explicit self-hosting maturity levels with objective promotion gates and CI/reporting hooks."
---

# Problem
Self-hosting behavior had deterministic evidence for bounded loops, but there was no executable maturity model describing current level, promotion criteria, and CI-enforced gate evaluation.

# Solution Pattern
Define maturity as a gated ladder with machine-evaluated evidence:
- publish level declarations (`deterministic-local`, `provider-backed`, `autonomous`),
- assign objective gate IDs per level,
- implement a deterministic gate runner that emits a versioned report contract,
- enforce current-level requirement in CI,
- keep higher-level criteria explicit and auditable via `pending` gate status until evidence artifacts are published.

# Key Insight
Maturity claims become reliable when they are treated as executable policy, not static prose.

# Implementation References
- Files touched:
  - `scripts/self-host-maturity.js`
  - `.github/workflows/ci.yml`
  - `package.json`
  - `docs/self-hosting-maturity-ladder.md`
  - `docs/spec-conformance-matrix.md`
  - `README.md`
  - `ROADMAP.md`
  - `AGENTS.md`
- Tests added/updated:
  - `packages/cli/src/self-host-maturity.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-plan.md`
  - `docs/reviews/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `self_host_maturity_report.v1` reports deterministic-local as eligible and enumerates provider/autonomous next-level requirements.
  - CI job enforces `--require-level deterministic-local` and emits report artifacts.
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` (`Core Commands` and `Conventions` updated with maturity gate command/policy)

# Reuse Guidance
- When to apply this pattern:
  - Any roadmap track that needs staged capability claims with objective promotion criteria.
- When not to apply:
  - One-off experimental work where no persistent capability claim is made.
- Known tradeoffs:
  - Requires periodic maintenance of evidence artifact paths for higher maturity levels.
