# Scenario Curation Interface Plan

## Goal
Implement explicit separation between in-repo tests and external holdout scenarios with curation UI.

## Scope
1. Scenario registry directory structure
2. Curation CLI interface
3. Holdout freshness validation
4. Promotion workflow (holdout → in-repo)

## Implementation Details

### 1. Directory Structure
```
scenarios/
├── in-repo/           # Version-controlled, runs on every PR
│   ├── smoke/
│   ├── regression/
│   └── README.md      # Catalog of in-repo scenarios
├── holdout/           # External, runs on convergence only
│   ├── curated/
│   └── README.md      # Catalog of holdout scenarios
└── templates/         # Scenario templates for curation
    └── workflow.dot   # Template for new scenarios
```

### 2. Curation CLI
- Command: `factorial scenarios:curate`
- Interactive TUI for:
  - Listing scenarios with metadata (difficulty, category, last run)
  - Shaping synthetic scenarios (prompt editing, expected outcome)
  - Tagging: `difficulty=beginner|intermediate|expert`, `category=bugfix|feature|refactor`
  - Promoting holdout → in-repo (copies to in-repo/, adds to catalog)

### 3. Freshness Check
- Command: `factorial scenarios:check-freshness`
- Validates:
  - Holdout scenarios updated within 30 days
  - In-repo scenarios have matching holdout coverage
  - No duplicate scenario IDs
- CI gate: Fails if holdout stale

### 4. Catalog Format
- `scenarios/in-repo/README.md`: Table of scenarios with IDs, descriptions, tags
- `scenarios/holdout/README.md`: Same format, but marked as external
- Auto-updated by curation CLI

## Affected Files
- `scenarios/` (new directory structure)
- `packages/cli/src/commands/scenarios-curate.ts` (curation UI)
- `packages/cli/src/commands/scenarios-check-freshness.ts` (freshness check)
- `scripts/scenario-curation.js` (backend logic)

## Validation
- E2E tests for curation workflow
- Freshness check tests (pass/fail fixtures)
- Verify catalog auto-updates

## Issue ID
SC-001
