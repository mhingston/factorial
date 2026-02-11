# Backlog BK-001 Replay/Provenance UX Completion

Last updated: 2026-02-11

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-001` (Replay/provenance UX improvements)

## Implemented Capabilities
1. Manifest inspection command
- Added `factorial manifest --manifest <path>`:
  - deterministic replay/provenance summary from `run_manifest.json`,
  - text output for terminal triage,
  - JSON output for automation (`--json`).

2. Replay-focused manifest diff
- Added `factorial manifest --manifest <left> --compare <right>`:
  - replay/provenance equivalence signal (`MATCH` or `DIFF`),
  - structured diff across normalized fields:
    - `graph` identity/profile,
    - replay config profile,
    - node status flow,
    - provenance identity by node (`provider/model/backend/operation/output_mode`).

3. Regression coverage and docs
- Added e2e test coverage validating manifest summary/diff JSON for run vs replay parity.
- Updated README command docs and examples.

## Validation Evidence
- `npm run test:run -- packages/cli/src/e2e-smoke.test.ts` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-001-replay-provenance-ux-batch-1-plan.md`](../plans/bk-001-replay-provenance-ux-batch-1-plan.md)
- Review: [`docs/reviews/bk-001-replay-provenance-ux-batch-1-review.md`](../reviews/bk-001-replay-provenance-ux-batch-1-review.md)
- Solution: [`docs/solutions/replay-manifest-summary-and-diff.md`](../solutions/replay-manifest-summary-and-diff.md)

## Exit Criteria
- Replay/provenance analysis no longer requires raw manual manifest inspection for common incident triage.
- Run-to-replay equivalence can be checked through deterministic CLI output and test-covered behavior.
