# Backlog BK-010 Deterministic Verification Hardening and Flake Replay Gate Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-010` (Deterministic verification hardening and flake replay gate)

## Implemented Capabilities
1. Deterministic CLI/e2e build-coupling hardening
- Added shared deterministic CLI suite harness:
  - `packages/cli/src/test-harness.ts`
- Provides lock/sentinel guarded prebuild path and deterministic suite-scoped temp/log roots.
- Migrated build-invoking CLI suites to shared harness usage:
  - `packages/cli/src/e2e-smoke.test.ts`
  - `packages/cli/src/self-host-dogfood.test.ts`
  - `packages/cli/src/self-host-maturity.test.ts`

2. Deterministic flake replay command and report contract
- Added command/script:
  - `npm run self-host:flake`
  - `scripts/self-host-flake-replay.js`
- Publishes deterministic evidence artifact:
  - `docs/metrics/reports/self-host-flake-latest.json` (`self_host_flake_report.v1`)
- Report captures:
  - required suite catalog (`FLAKE-001..FLAKE-003`),
  - replay attempt outcomes,
  - per-suite pass-rate metrics,
  - threshold compliance and overall pass/fail decision.

3. CI flake-threshold enforcement
- Added CI job `self-host-flake` in `.github/workflows/ci.yml`.
- CI now runs replay gate with deterministic thresholds and uploads flake report artifact.

4. Documentation/process convergence
- Updated command/docs references in `README.md`, `ROADMAP.md`, and `AGENTS.md`.
- Added BK-010 plan/review/solution references and completion linkage.

## Validation Evidence
- `npm run self-host:flake -- --replay-count 2 --min-pass-rate 1 --report ./docs/metrics/reports/self-host-flake-latest.json` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS
- `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-plan.md`](../plans/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-plan.md)
- Review: [`docs/reviews/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-review.md`](../reviews/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-review.md)
- Solution: [`docs/solutions/deterministic-cli-suite-isolation-and-flake-replay-gate.md`](../solutions/deterministic-cli-suite-isolation-and-flake-replay-gate.md)

## Exit Criteria
- Repeated verification runs now produce stable pass/fail outcomes for required suites under configured replay count (`replay_count=2`, `min_pass_rate=1`).
- Flake evidence artifact schema is versioned/documented (`self_host_flake_report.v1`) and reproducible from repository command paths.
