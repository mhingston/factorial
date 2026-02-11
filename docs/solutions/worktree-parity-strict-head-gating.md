---
title: "Worktree Parity Strict HEAD Gating"
category: "reliability"
tags:
  - "worktree"
  - "ci"
  - "parity"
date: "2026-02-11"
trigger: "RMD-021 required preventing silent worktree-parity skip paths from being treated as successful CI verification."
---

# Problem
A parity check that skips with exit 0 in no-`HEAD` contexts can be correct locally but risky in CI if skip behavior is not explicitly gated.

# Solution Pattern
Use dual-mode behavior: keep local default skip for no-`HEAD` environments, but enforce strict mode in CI via an explicit env contract (`WORKTREE_PARITY_REQUIRE_HEAD=1`) so no-`HEAD` becomes a hard failure.

# Key Insight
Reliability comes from making environment assumptions explicit in CI, not from forcing identical behavior across all local contexts.

# Implementation References
- Files touched:
  - `scripts/worktree-parity-check.js`
  - `.github/workflows/ci.yml`
  - `README.md`
  - `ROADMAP.md`
- Tests added/updated:
  - N/A (command-level verification)
- Related plan/review artifacts:
  - Plan: `docs/plans/rmd-021-worktree-parity-batch-1-plan.md`
  - Review: `docs/reviews/rmd-021-worktree-parity-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:worktree` (local non-strict no-`HEAD` skip behavior)
  - `WORKTREE_PARITY_REQUIRE_HEAD=1 npm run test:worktree` (strict mode fail on no-`HEAD`)
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not required; existing AGENTS guidance already emphasizes deterministic CI checks and explicit constraints.

# Reuse Guidance
- When to apply this pattern:
  - Scripts where local environments can validly skip a check but CI must treat missing prerequisites as failure.
- When not to apply:
  - Checks that must be mandatory and identical in all local and CI environments.
- Known tradeoffs:
  - Requires documenting mode differences clearly to avoid contributor confusion.
