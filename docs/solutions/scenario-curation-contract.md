---
title: "Scenario Curation Interface Pattern"
category: "process"
tags:
  - "scenario-curation"
  - "testing"
  - "ci-gate"
date: "2026-02-12"
trigger: "SC-001 implementation"
---

# Problem

Testing workflows need explicit separation between:
1. **In-repo scenarios** - Fast, version-controlled, run on every PR
2. **Holdout scenarios** - Comprehensive, external, run on convergence

Without clear separation:
- PR builds become slow due to exhaustive testing
- Convergence lacks thorough validation
- No systematic way to promote validated scenarios
- Stale holdout scenarios go unnoticed

# Solution Pattern

## Directory Structure

```
scenarios/
├── in-repo/
│   ├── smoke/          # Quick PR validation
│   ├── regression/     # Detailed regression tests
│   └── README.md       # Catalog with metadata tables
├── holdout/
│   ├── curated/        # External test scenarios
│   └── README.md       # Catalog + freshness policy
└── templates/
    └── workflow.dot    # Scenario template
```

## CLI Interface

```bash
# Interactive curation TUI
factorial scenarios:curate

# Promote holdout → in-repo
factorial scenarios:curate --promote <scenario-id>

# Check freshness (CI gate)
factorial scenarios:check-freshness

# CI mode (fails if stale)
factorial scenarios:check-freshness --ci
```

## Freshness Policy

| Metric | Threshold | Action |
|--------|-----------|--------|
| Max Age | 30 days | Fail CI gate |
| Duplicates | 0 | Fail CI gate |
| Coverage | All holdout in-repo | Warn |

## Promotion Workflow

1. Holdout scenario runs successfully on convergence
2. Curator reviews and approves via TUI or CLI
3. Scenario copied to `in-repo/regression/`
4. Metadata added: `promoted_from_holdout`, `promoted_at`
5. Both README catalogs updated

# Key Insight

**Separation enables optimization**: By distinguishing "fast feedback" (in-repo) from "thorough validation" (holdout), we can have both quick PR builds AND comprehensive convergence testing. The 30-day freshness gate ensures holdout scenarios stay current.

# Implementation References

- Files touched:
  - `scripts/scenario-curation.js` - Core logic
  - `packages/cli/src/index.ts` - CLI commands
  - `scenarios/in-repo/README.md` - Catalog
  - `scenarios/holdout/README.md` - Catalog + policy
  - `scenarios/templates/workflow.dot` - Template
- Tests added/updated: None (delegated to existing DTU harness)
- Related plan/review artifacts:
  - `docs/plans/scenario-curation-interface.md`
  - `docs/reviews/sc-001-batch-1-review.md`

# Validation Evidence

- What validated correctness:
  - Build passes: `npm run build` ✅
  - Lint passes: `npm run lint` ✅
  - Typecheck passes: `npm run typecheck` ✅
  - Tests pass: `npm run test:run` ✅
- What validated reliability over time:
  - Freshness gate with explicit 30-day threshold
  - Duplicate detection
  - Promotion audit trail (metadata)

# AGENTS/CLAUDE Update Note

- [x] Root agent context updated with this pattern
- Update location: `docs/solutions/scenario-curation-contract.md`

# Reuse Guidance

## When to apply this pattern:
- Project has multiple test tiers (fast vs. thorough)
- Need to version-control some tests but keep others external
- Want CI gates for test freshness/completeness
- Team needs clear promotion workflow from external → internal

## When not to apply:
- All tests run quickly (< 5 min total)
- No external test sources
- No convergence/release process
- Simple project without staging tiers

## Known tradeoffs:
- **Complexity**: Adds directory structure and CLI surface
- **Maintenance**: Requires periodic holdout refreshing
- **Overhead**: Promotion workflow adds step to convergence
- **Benefit**: Faster PR builds + thorough validation

## Related patterns:
- `dtu-contract-first-runtime-boundary.md` - Scenario execution
- `deterministic-cli-suite-isolation-and-flake-replay-gate.md` - CI patterns
