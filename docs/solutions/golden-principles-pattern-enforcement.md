---
title: "Golden Principles Pattern Enforcement"
category: "process"
tags:
  - "golden-principles"
  - "automated-cleanup"
  - "pattern-enforcement"
date: "2026-02-13"
trigger: "BK-019 required systematic pattern enforcement to prevent 'AI slop' accumulation"
---

# Problem
Codebase accumulates "AI slop" - repeated pattern violations without systematic cleanup. Without automated enforcement, pattern violations accumulate over time, requiring expensive manual cleanup efforts. The cost of retroactive fixing grows linearly with codebase size.

# Solution Pattern
Implement machine-readable principles with automated detection and fix capabilities:

1. **Machine-Readable Principles**: Define patterns in `docs/golden-principles.md` with explicit rules (GP-001: mkdtemp isolation, GP-002: solution doc format, GP-003: req.body validation)

2. **Automated Detection**: `scripts/golden-principles-audit.js` scans codebase and produces structured violation reports:
   - Categorizes violations by rule ID
   - Maps to specific file:line locations
   - Distinguishes fixable vs. manual-fix violations

3. **Auto-Fix Capability**: `npm run golden:fix` automatically repairs GP-001 violations:
   - Replaces direct `mkdtemp` with `deterministicTempDir()` helper
   - Replaces ad-hoc `execa` build calls with `deterministicBuild()` helper
   - Updates imports and cleanup logic

4. **CI Integration**: Audit runs in CI to prevent new violations from entering main branch

## Report Contract
```typescript
{
  schema_version: 'golden_principles_audit_report.v1',
  generated_at: string,
  summary: {
    total_violations: number,
    rules_checked: string[],
    auto_fixable_count: number,
    manual_fix_required_count: number
  },
  violations: [{
    rule_id: string,
    file: string,
    line: number,
    message: string,
    auto_fixable: boolean
  }]
}
```

# Key Insight
**Weekly automated cleanup is cheaper than manual Friday cleanup.** The cost of pattern violations compounds over time. Automated enforcement at commit time prevents accumulation, while periodic batch cleanup (`golden:fix`) handles legacy debt incrementally.

# Implementation References
- Files touched:
  - `docs/golden-principles.md` (new)
  - `scripts/golden-principles-audit.js` (new)
  - `package.json` (added `golden:audit` and `golden:fix` scripts)
  - `.github/workflows/ci.yml` (CI integration)
- Tests added/updated:
  - `packages/core/src/golden-principles-audit.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-019-golden-principles-infrastructure.md`
  - `docs/reviews/bk-019-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run golden:audit` correctly detected 215 existing violations across codebase
  - `npm run golden:fix` successfully auto-fixed 138 GP-001 violations
  - `npm run test:run -- packages/core/src/golden-principles-audit.test.ts` (all tests passing)
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - CI workflow integration verified

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern
- Update location:
  - `AGENTS.md` "Golden Principles" section added with pattern enforcement guidance
  - `AGENTS.md` "Common Mistakes" section references golden principles for pattern compliance

# Reuse Guidance
- When to apply this pattern:
  - Codebase accumulating repeated pattern violations
  - Need for systematic, auditable pattern enforcement
  - Desire to reduce manual code review overhead for mechanical issues
  - Building CI gates for code quality
- When not to apply:
  - Small, short-lived projects where manual review is sufficient
  - Patterns that are subjective or require semantic understanding
  - When auto-fix would change behavior (golden:fix only handles safe transformations)
- Known tradeoffs:
  - Initial audit reveals legacy debt (215 violations in this codebase)
  - Some violations require manual fixing (format issues, intentional fixtures)
  - Tool maintenance required as codebase evolves
  - False positives possible with naive pattern matching
