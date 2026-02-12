# Backlog BK-003 Weekly Compound Metrics Helper Completion

Last updated: 2026-02-11

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-003` (Weekly compound metrics helper command)

## Implemented Capabilities
1. First-class CLI helper command
- Added `factorial compound-weekly`:
  - required `--start YYYY-MM-DD`,
  - optional `--end YYYY-MM-DD` (defaults to `start + 6 days`),
  - optional `--output <path>` for markdown report output.

2. Standardized weekly report contract
- Command computes standardized weekly metrics from repository artifacts:
  - solutions created weekly,
  - context updates weekly,
  - known issue recurrence rate,
  - reopen rate,
  - review artifacts counted.
- Writes deterministic markdown report format aligned with existing metrics reports.

3. Automation-friendly JSON output + regression coverage
- Added `--json` mode emitting `compound_weekly_metrics.v1`.
- Added e2e CLI coverage validating JSON payload and markdown report artifact behavior.
- Updated README command examples and roadmap status/artifacts.

## Validation Evidence
- `npm run test:run -- packages/cli/src/e2e-smoke.test.ts` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-003-weekly-compound-metrics-helper-batch-1-plan.md`](../plans/bk-003-weekly-compound-metrics-helper-batch-1-plan.md)
- Review: [`docs/reviews/bk-003-weekly-compound-metrics-helper-batch-1-review.md`](../reviews/bk-003-weekly-compound-metrics-helper-batch-1-review.md)
- Solution: [`docs/solutions/weekly-compound-metrics-cli-helper.md`](../solutions/weekly-compound-metrics-cli-helper.md)

## Exit Criteria
- Optional helper command exists for generating standardized weekly reports from repository artifacts.
- Weekly report generation is deterministic and available via both markdown artifact output and JSON payload mode.
