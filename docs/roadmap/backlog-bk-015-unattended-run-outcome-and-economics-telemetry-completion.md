# Backlog BK-015 Unattended-Run Outcome and Economics Telemetry Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-015` (Unattended-run outcome and economics telemetry)

## Implemented Capabilities
1. Deterministic unattended telemetry publication command/report
- Added command:
  - `npm run self-host:unattended-telemetry`
- Added script:
  - `scripts/self-host-unattended-telemetry-report.js`
- Added source schema:
  - `self_host_unattended_telemetry_source.v1`
- Added report schema:
  - `self_host_unattended_telemetry_report.v1`
- Added latest artifacts:
  - `docs/metrics/reports/self-host-unattended-telemetry-source-latest.json`
  - `docs/metrics/reports/self-host-unattended-telemetry-latest.json`

2. Required value-aware metrics (deterministic)
- Run outcome metrics:
  - run success rate (`successful_runs / total_runs`)
  - run-to-merge ratio (`total_runs / merged_prs`)
- Task mix metrics:
  - `small|medium|large` distribution from bounded score model over changed files/tests/runtime
- Economics metrics:
  - token-cost proxy + execution-cost proxy totals
  - cost per merged PR proxy
- Post-merge maintenance metrics:
  - revert rate
  - churn PR rate
  - average churn commits per merged PR

3. Strict schema + freshness fail-closed checks
- Added deterministic check IDs:
  - `UT-001` source schema/required fields
  - `UT-002` source freshness SLA
  - `UT-003` required outcome/economics metric completeness
  - `UT-004` post-merge maintenance indicator completeness
- Command exits non-zero when any required check fails.

4. CI/reporting enforcement lane
- Added workflow job in `.github/workflows/ci.yml`:
  - `self-host-unattended-telemetry`
- Behavior:
  - runs unattended telemetry command against latest source artifact
  - fails closed on invalid/missing/stale required fields
  - uploads report artifact from `logs/self_host_unattended_telemetry_ci/report.json`

5. Docs/process convergence
- Updated:
  - `README.md` command reference
  - `docs/metrics/compound-rate.md` reporting location + command
  - `AGENTS.md` core commands/backlog direction note
  - `ROADMAP.md` status snapshot, execution handoff, completion references, and board rows

## Validation Evidence
- `npm run self-host:unattended-telemetry -- --source ./docs/metrics/reports/self-host-unattended-telemetry-source-latest.json --report ./docs/metrics/reports/self-host-unattended-telemetry-latest.json` -> PASS
- `npm run self-host:unattended-telemetry -- --source ./docs/metrics/reports/self-host-unattended-telemetry-source-latest.json --report ./logs/self_host_unattended_telemetry_ci/report.json` -> PASS
- `npm run test:run -- packages/cli/src/self-host-unattended-telemetry-report.test.ts` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run docs:freshness -- --report ./logs/docs_freshness/report.json` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-plan.md`](../plans/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-plan.md)
- Review: [`docs/reviews/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-review.md`](../reviews/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-review.md)
- Solution: [`docs/solutions/unattended-run-outcome-and-economics-telemetry-contract.md`](../solutions/unattended-run-outcome-and-economics-telemetry-contract.md)

## Exit Criteria
- Telemetry report is reproducible from repository source artifact and machine-validated with strict check IDs.
- Roadmap/README references include unattended telemetry artifacts whenever throughput claims are stated.
- Regression coverage includes compliant pass and malformed/missing/stale fail-closed scenarios.
