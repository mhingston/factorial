# Plan: Evidence Freshness Automation (EF-001)

## Metadata
- Date: 2026-02-12
- Author: Subagent
- Related issue/PR: EF-001
- Risk level: medium

## Requirement / Behavior Delta
- Current behavior: No automated freshness checks for published evidence artifacts. Stale evidence can go undetected.
- Target behavior: Automated freshness checks with CI gates, auto-refresh workflows, and drift detection for all published evidence.
- Why this change is needed: Reliability requirement - evidence must be current to support claims and SLOs.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| CI Structure | `.github/workflows/ci.yml` | Multiple gate jobs, no freshness checks | Can add as new job |
| Report Pattern | `scripts/self-host-maturity.js` | Reads JSON reports, validates schemas | Similar pattern for freshness |
| Check Logic | `scripts/check-pr-compound-artifacts.js` | CLI tool with exit codes | Same pattern for freshness CLI |
| CLI Commands | `packages/cli/src/index.ts` | Uses commander.js for CLI | Add check:freshness, report:freshness |

## External Constraints
- API/provider constraints: N/A (local file operations only)
- Runtime/environment constraints: Must work in GitHub Actions (ubuntu-latest)
- Backward compatibility constraints: New commands only, no breaking changes

## Design Outline
- Proposed approach:
  1. Create `check-freshness.ts` module with age calculation and schema validation
  2. Add CLI commands: `check:freshness`, `report:freshness`, `check:drift`
  3. Define FreshnessReport interface with schema_version
  4. Add CI job for freshness gate
  5. Create weekly refresh workflow
  6. Create unit tests for age calculation logic
- Rejected alternatives and why:
  - cron-based freshness: Less visible, harder to debug
  - Manual freshness checks: Not scalable
- Affected interfaces and contracts:
  - New CLI commands
  - FreshnessReport schema
  - CI workflow additions

## Edge Cases
- Edge case 1: Artifact file doesn't exist - should report 'missing' status
- Edge case 2: Artifact is not valid JSON - should report schema error
- Edge case 3: Artifact has no mtime (e.g., created at runtime) - should handle gracefully
- Edge case 4: Clock skew between CI runners - use relative time from CI start
- Failure mode handling: Always fail-closed (stale/missing evidence = CI failure)

## High-Risk Invariants (Required for security, money, data integrity, concurrency)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| EF-001-INV-1 | Freshness check must be deterministic (same input = same output) | Use file mtime, not current time in calculation | Unit test with mock mtime |
| EF-001-INV-2 | Missing evidence must fail CI gate | Exit code 1 on missing artifact | E2E test with missing file |
| EF-001-INV-3 | Stale evidence must fail CI gate | Exit code 1 when age > max_age | E2E test with stale file |
| EF-001-INV-4 | Report schema must be versioned | Include schema_version field | Schema validation test |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: EF-001
- Implementer scope statement (batch-limited): Implement all freshness automation features as specified
- Verifier scope statement (batch-only): Verify EF-001 implementation only
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
