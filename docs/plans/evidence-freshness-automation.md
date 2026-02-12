# Evidence Freshness Automation Plan

## Goal
Automated freshness checks and refresh workflows for all published evidence.

## Scope
1. Freshness gates in CI
2. Auto-refresh workflows
3. Freshness report generation
4. Drift detection (claims vs evidence)

## Implementation Details

### 1. Freshness Gates
- Command: `factorial check:freshness --max-age-hours <n> --artifact <path>`
- Validates:
  - File exists
  - Last modified < max-age-hours
  - JSON schema valid
- CI integration:
```yaml
- name: Provider-backed evidence freshness
  run: |
    factorial check:freshness \
      --max-age-hours 168 \
      --artifact docs/metrics/reports/self-host-provider-backed-latest.json
```

### 2. Auto-Refresh Workflows
Update `.github/workflows/`:

**Weekly (Sundays)**:
- `compound-weekly`
- `self-host:provider-backed`
- `self-host:autonomous`
- `metrics:economics` (if EV-001 done)

**Nightly**:
- `self-host:provider-backed-live` (secret-gated)
- `metrics:satisfaction` (if SS-001 done)

**On-demand** (pre-release):
- All evidence publication commands

### 3. Freshness Report
- Command: `factorial report:freshness`
- Output: `evidence_freshness_report.v1` with:
```typescript
interface EvidenceFreshnessReport {
  schema_version: 'evidence_freshness_report.v1';
  generated_at: string;
  reports: Array<{
    artifact_path: string;
    last_modified: string;
    age_hours: number;
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

### 4. Drift Detection
- Compare `docs/spec-conformance-matrix.md` deltas against actual evidence
- Detect when a claim (e.g., "FA-001 implemented") lacks fresh evidence
- Command: `factorial check:drift`

## Affected Files
- `.github/workflows/ci.yml` (add freshness job)
- `.github/workflows/weekly-evidence-refresh.yml` (new workflow)
- `packages/cli/src/commands/check-freshness.ts` (freshness check)
- `packages/cli/src/commands/report-freshness.ts` (freshness report)
- `scripts/check-freshness.js` (backend logic)

## Validation
- Unit tests for age calculation
- E2E test for freshness check (pass/fail fixtures)
- Verify CI job fails on stale evidence

## Issue ID
EF-001
