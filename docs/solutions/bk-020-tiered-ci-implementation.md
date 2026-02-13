# BK-020: Tiered Throughput CI Implementation

**Date:** 2026-02-13  
**Issue:** BK-020  
**Status:** Implemented  

## Summary

Implemented a three-tier CI system to balance velocity and reliability based on PR risk assessment.

## Files Created/Modified

### New Files
1. **`scripts/ci-tier-classifier.js`** - Deterministic tier classification based on:
   - Diff size (<50 lines for fast-track)
   - Security-critical file detection
   - plan.md metadata (`ci_tier` field)
   - PR labels (`tier:fast`, `tier:emergency`)
   - Branch patterns (`hotfix/*`, `emergency/*`)

2. **`scripts/fast-track-coverage.js`** - Changed-line coverage verification:
   - Parses git diff to identify modified lines
   - Compares against coverage report
   - Enforces 100% coverage on changed source lines

3. **`scripts/emergency-tracker.js`** - Emergency fix tracking:
   - Creates GitHub tracking issues automatically
   - Enforces 2-hour revert window
   - Requires 24-hour post-merge review

### Modified Files
1. **`.github/workflows/ci.yml`** - Complete workflow refactoring:
   - Added `tier-classification` job (runs first)
   - Added `fast-track-verify` job (8-12 min runtime)
   - Added `emergency-verify` job (5-8 min runtime)
   - Modified all existing jobs with `if:` conditions
   - Added `ci-complete` aggregator job
   - Added `metrics-collection` job

2. **`AGENTS.md`** - Added CI Tier Selection Rules section:
   - Documented all three tiers
   - Specified qualification criteria
   - Documented tier selection priority
   - Listed important invariants

3. **`docs/templates/plan.md`** - Added `ci_tier` metadata field

4. **`package.json`** - Added npm scripts for new tools

## Workflow Logic

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER CLASSIFICATION                       │
│  (Always runs first - determines which tier to use)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
   ┌─────────┐   ┌──────────┐  ┌──────────┐
   │  FAST   │   │ STANDARD │  │ EMERGENCY│
   │  TRACK  │   │  TRACK   │  │   FIX    │
   │~8-12 min│   │~90-100min│  │ ~5-8 min │
   └─────────┘   └──────────┘  └──────────┘
         │             │             │
         │             │             │
   lint, typecheck,   Full matrix   lint, typecheck,
   test:run (Node20)  (12+ jobs)    test:run (Node20)
   coverage (changed)              + tracking issue
   worktree parity                 + auto-merge
```

## Tier Selection Priority

1. **Emergency** - Branch pattern or label
2. **Security files** - `.github/workflows/`, `**/auth/`, `**/crypto/`
3. **Plan.md metadata** - `ci_tier` field
4. **PR labels** - `tier:fast`, `tier:emergency`
5. **Automated analysis** - Line count, file patterns
6. **Default** - Standard track

## Security Invariants

| ID | Invariant | Enforcement |
|---|---|---|
| INV-SEC-001 | Security files never fast-track | Path pattern matching |
| INV-SEC-002 | Lint/typecheck never skipped | Job-level `if:` conditions |
| INV-SEC-003 | Emergency requires tracking | `emergency-tracker.js` |
| INV-SEC-004 | 100% coverage on changed lines | `fast-track-coverage.js` |
| INV-SEC-005 | Deterministic classifier | No timestamps/randomness |
| INV-SEC-006 | 2-hour revert window | Issue template + monitoring |
| INV-SEC-007 | Author reputation tracking | Metrics collection |
| INV-SEC-008 | Auditable decisions | PR comments with reasoning |

## Validation Results

### ✅ Syntax Validation
- `scripts/ci-tier-classifier.js` - Valid JavaScript
- `scripts/fast-track-coverage.js` - Valid JavaScript  
- `scripts/emergency-tracker.js` - Valid JavaScript
- `.github/workflows/ci.yml` - Valid YAML structure

### ✅ Logic Validation
- Fast-track correctly skips heavy gates (DTU, golden, maturity, etc.)
- Standard-track runs full matrix when tier is 'standard' or default
- Emergency lane includes tracking issue creation
- All tiers include lint and typecheck (never skipped)
- Security file detection prevents fast-track

### ⚠️ Existing Issues (Not Related)
- `packages/cli/src/index.ts` has pre-existing lint/type errors
- These are unrelated to this implementation

## Usage Examples

### Fast-Track Request
```yaml
# In plan.md metadata:
ci_tier: fast
risk level: low
```

Or add label: `tier:fast`

### Emergency Fix
```bash
git checkout -b hotfix/critical-bug-fix
# Push and create PR
```

Or add label: `emergency-fix`

## Metrics

The system tracks:
- Tier selection per PR
- Duration by tier
- Author velocity vs incident correlation
- Fast-track incident rates

## Blockers Encountered

None. Implementation complete as specified.

## Next Steps

1. Merge PR
2. Monitor tier classifications for accuracy
3. Adjust thresholds based on observed velocity/reliability trade-offs
4. Consider adding more automated signals (e.g., test file changes)
