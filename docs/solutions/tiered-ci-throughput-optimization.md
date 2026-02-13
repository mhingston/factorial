---
title: "Tiered CI Throughput Optimization"
category: "process"
tags:
  - "ci-gates"
  - "throughput"
  - "velocity"
  - "tiered-system"
date: "2026-02-13"
trigger: "BK-020 required balancing CI safety with velocity via tiered gates"
---

# Problem
All PRs go through 90-100 minute CI regardless of risk, bottlenecking velocity. Low-risk changes (docs, small fixes) wait as long as high-risk changes (security, major features). This creates unnecessary friction for routine development while providing insufficient gating for critical changes.

# Solution Pattern
Implement a three-tier CI system that matches validation depth to change risk:

1. **Tier 1: Fast-Track (~8-12 minutes)**
   - For: Small, low-risk changes (<50 lines, no security-critical files)
   - Gates: lint, typecheck, test:run (Node 20), coverage on changed lines only
   - Skips: DTU harness, golden regression, maturity gates, flake replay
   - Entry signals: `ci_tier: fast` in plan.md, PR label `tier:fast`, automated docs-only detection

2. **Tier 2: Standard-Track (~90-100 minutes)**
   - For: Medium/high-risk changes, ≥50 lines, security-critical files
   - Gates: Full CI matrix (all 12+ jobs)
   - Default for all PRs without explicit tier qualification

3. **Tier 3: Emergency-Fix (~5-8 minutes)**
   - For: Production hotfixes requiring immediate deployment
   - Gates: lint, typecheck, test:run (Node 20) only
   - Post-merge requirements: Automatic tracking issue, 2-hour revert window, 24-hour post-merge review
   - Entry signals: `hotfix/*` or `emergency/*` branch, PR label `emergency-fix`

## Security Invariants (Never Violated)
- **Lint and typecheck are NEVER skipped** in any tier
- **Security-critical files NEVER qualify for fast-track** (`.github/workflows/`, `**/auth/`, `**/crypto/`)
- **Tier classifier is deterministic** - same inputs always produce same tier

## Tier Selection Priority
1. Emergency signals (branch pattern, label, plan.md metadata)
2. Security-critical file detection
3. Plan.md `ci_tier` field
4. PR labels
5. Automated analysis (line count, file patterns)
6. Default: Standard track

# Key Insight
**Corrections are cheap, waiting is expensive.** The cost of a false-positive fast-track (missing a bug that gets caught in standard) is a follow-up fix. The cost of forcing all changes through standard track is 80+ minutes of developer time per change. Balance safety with velocity by accepting bounded risk for bounded reward.

# Implementation References
- Files touched:
  - `.github/workflows/ci.yml` (three distinct job lanes)
  - `scripts/ci-tier-classifier.js` (tier selection logic, 168-235 lines)
  - `scripts/fast-track-coverage.js` (100% coverage verification on changed lines)
  - `scripts/emergency-tracker.js` (post-merge tracking and revert window)
- Tests added/updated:
  - `packages/cli/src/ci-tier-classifier.test.ts`
  - `packages/cli/src/fast-track-coverage.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-020-tiered-throughput-philosophy.md`
  - `docs/reviews/bk-020-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - Three-tier system implemented with distinct job lanes in CI workflow
  - Security-critical file patterns correctly force standard track
  - Coverage verification enforces 100% on changed lines (excludes test files)
  - Emergency tracking creates proper GitHub issues with 24-hour review requirement
  - Tier classifier produces deterministic outputs for same inputs
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - CI workflow matrix testing
  - Security pattern matching verified against known security-critical files

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern
- Update location:
  - `AGENTS.md` "CI Tier Selection Rules" section added with complete tier definitions
  - `AGENTS.md` "Common Mistakes" section warns against mixing security-critical changes with fast-track

# Reuse Guidance
- When to apply this pattern:
  - CI pipeline duration is a velocity bottleneck
  - Changes have clearly distinguishable risk profiles
  - Security-critical code paths can be identified by file patterns
  - Team can tolerate occasional false-positives (follow-up fixes) in exchange for faster iteration
- When not to apply:
  - All changes have similar risk profiles
  - Security-critical code cannot be isolated to specific file patterns
  - Team culture cannot tolerate any fast-track failures
  - CI duration is not a significant bottleneck (<15 minutes total)
- Known tradeoffs:
  - Fast-track may miss issues caught by full matrix (requires follow-up fix)
  - Tier classification adds complexity to CI configuration
  - Emergency track requires post-merge discipline (24-hour review window)
  - Coverage verification on changed lines requires git history access
