---
title: "Evidence Freshness Automation Pattern"
category: "process"
tags:
  - "evidence"
  - "ci-automation"
  - "freshness-checks"
date: "2026-02-12"
trigger: "Implementing EF-001: Automated freshness checks for all published evidence"
---

# Problem
Evidence artifacts (reports, metrics, SLO claims) become stale over time but there's no automated detection. This leads to:
- Stale claims in documentation
- CI passing on outdated evidence
- Manual overhead to check freshness

# Solution Pattern

## 1. Freshness Report Schema
Define a versioned schema for freshness reports:
```typescript
interface EvidenceFreshnessReport {
  schema_version: 'evidence_freshness_report.v1';
  generated_at: string;
  reports: Array<{
    artifact_path: string;
    last_modified: string | null;
    age_hours: number | null;
    max_age_hours: number;
    status: 'fresh' | 'stale' | 'missing';
    recommended_action: string;
    schema_valid: boolean;
    schema_version: string | null;
  }>;
  summary: { total: number; fresh: number; stale: number; missing: number };
  overall_status: 'healthy' | 'warning' | 'critical';
}
```

## 2. CLI Commands
- `factorial check:freshness --max-age-hours <n> --artifact <path>` - Check specific artifact or all
- `factorial report:freshness` - Generate full freshness report
- `factorial check:drift` - Detect drift (placeholder for future)

## 3. CI Integration
Add job to `.github/workflows/ci.yml`:
```yaml
evidence-freshness:
  runs-on: ubuntu-latest
  steps:
    - name: Check Evidence Freshness
      run: |
        npm run evidence:freshness -- \
          --max-age-hours 168 \
          --report ./logs/evidence_freshness_ci/report.json
```

## 4. Weekly Refresh Workflow
Create `.github/workflows/weekly-evidence-refresh.yml`:
- Schedule: Weekly on Sundays
- Jobs: compound-weekly, self-host-provider-backed, self-host-autonomous, full-autonomy-readiness
- Final job: Verify freshness after refresh

# Key Insight
Fail-closed design: Missing or stale evidence must fail CI. This ensures evidence never goes stale undetected.

# Implementation References
- Files touched:
  - `packages/cli/src/index.ts` - Added CLI commands and helper functions
  - `packages/cli/src/evidence-freshness.test.ts` - Unit tests
  - `scripts/evidence-freshness.js` - Standalone script
  - `.github/workflows/ci.yml` - Added CI job
  - `.github/workflows/weekly-evidence-refresh.yml` - New workflow
  - `package.json` - Added npm scripts
- Tests added/updated:
  - Evidence freshness logic unit tests
  - CLI command existence tests
- Related plan/review artifacts:
  - `docs/plans/ef-001-evidence-freshness-automation-plan.md`
  - `docs/reviews/ef-001-batch-1-review.md`

# Validation Evidence
- What validated correctness: Typecheck passes, lint passes
- What validated reliability over time: CI gate will catch stale evidence

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern
- Update location: AGENTS.md core commands section

# Reuse Guidance
- When to apply this pattern: Any repository with evidence artifacts that need freshness guarantees
- When not to apply: If evidence is static and never changes, or if manual review is preferred
- Known tradeoffs: Adds CI time; requires weekly job infrastructure
