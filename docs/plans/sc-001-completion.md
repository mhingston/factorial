# SC-001 Completion Report

## Issue ID
SC-001

## Task
Implement explicit separation between in-repo and holdout scenarios with curation UI.

## Status
✅ **COMPLETE**

## Implementation Summary

### 1. Directory Structure Created ✅

```
scenarios/
├── in-repo/
│   ├── smoke/              # Quick PR validation tests
│   ├── regression/         # Detailed regression tests
│   └── README.md           # Catalog with scenario tables
├── holdout/
│   ├── curated/            # External holdout scenarios
│   └── README.md           # Catalog with freshness policy
└── templates/
    └── workflow.dot        # Scenario template for curation
```

### 2. CLI Commands Implemented ✅

| Command | Status | Description |
|---------|--------|-------------|
| `factorial scenarios:curate` | ✅ | Interactive TUI for scenario curation |
| `factorial scenarios:curate --promote <id>` | ✅ | Promote holdout to in-repo |
| `factorial scenarios:check-freshness` | ✅ | Validate freshness (30-day threshold) |
| `factorial scenarios:check-freshness --ci` | ✅ | CI mode - fails on staleness |

### 3. Catalog README Files ✅

- **In-repo README**: Table format with ID, Description, Difficulty, Category, Last Updated
- **Holdout README**: Same format + freshness policy table (30-day max age)
- **Templates**: DOT workflow template for new scenarios

### 4. Freshness CI Gate ✅

Validates:
- Holdout scenarios updated within 30 days
- No duplicate scenario IDs
- Coverage check (warns if holdout lacks in-repo equivalent)

Returns:
- Exit code 0 if fresh
- Exit code 1 if stale (for CI integration)

### 5. Promotion Workflow ✅

1. Scenario exists in `scenarios/holdout/curated/`
2. Run: `factorial scenarios:curate --promote <scenario-id>`
3. Scenario copied to `scenarios/in-repo/regression/`
4. Metadata added: `promoted_from_holdout: true`, `promoted_at: <timestamp>`

## Files Created/Modified

### New Files
1. `scripts/scenario-curation.js` - Core curation logic (270 lines)
2. `scenarios/in-repo/README.md` - In-repo catalog
3. `scenarios/in-repo/smoke/` - Smoke test directory (empty)
4. `scenarios/in-repo/regression/` - Regression test directory (empty)
5. `scenarios/holdout/README.md` - Holdout catalog
6. `scenarios/holdout/curated/` - Holdout directory (empty)
7. `scenarios/templates/workflow.dot` - Scenario template

### Modified Files
1. `packages/cli/src/index.ts` - Added CLI command definitions

## Validation Results

| Check | Command | Status |
|-------|---------|--------|
| Build | `npm run build` | ✅ Pass |
| Lint | `npm run lint` | ✅ Pass |
| Typecheck | `npm run typecheck` | ✅ Pass |
| Tests | `npm run test:run` | ✅ Pass |

## Output Artifacts (Per Factorial Conventions)

| Artifact | Location | Status |
|----------|----------|--------|
| Review | `docs/reviews/sc-001-batch-1-review.md` | ✅ Created |
| Solution Contract | `docs/solutions/scenario-curation-contract.md` | ✅ Created |
| Completion Report | `docs/plans/sc-001-completion.md` | ✅ Created (this file) |

## Blockers Encountered

None. Implementation proceeded smoothly.

## Follow-up Recommendations

### Immediate (Next Batch)
- Add scenario tagging support (`--difficulty`, `--category` flags)
- Implement template variable replacement in workflow.dot
- Add scenario creation wizard to TUI

### Future Enhancements
- Full-featured TUI with inquirer.js or similar
- Automatic README catalog updates on promotion
- Integration with DTU scenario harness for execution
- Web UI for non-CLI users

## Sign-off

- **Implementer**: Subagent
- **Date**: 2026-02-12
- **Consensus Lock**: `resolved`
- **Ratchet Status**: Batch complete, no new critique until next batch
