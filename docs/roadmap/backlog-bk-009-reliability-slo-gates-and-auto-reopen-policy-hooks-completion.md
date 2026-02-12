# Backlog BK-009 Reliability SLO Gates and Auto-Reopen Policy Hooks Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-009` (Reliability SLO gates and auto-reopen policy hooks)

## Implemented Capabilities
1. Deterministic reliability SLO evaluator and report contract
- Added `scripts/reliability-slo-gate.js` and npm command:
  - `npm run reliability:slo`
- Publishes deterministic artifact:
  - `docs/metrics/reports/compound-reliability-slo-latest.json` (`compound_reliability_slo_report.v1`)
- Enforces explicit checks:
  - `SLO-001`: lock-resolution rate minimum
  - `SLO-002`: reopen ratio ceiling
  - `SLO-003`: cadence freshness
  - `SLO-004`: auto-reopen policy decision hook

2. Deterministic auto-reopen policy hook
- Reliability evaluator emits explicit `consensus_lock_decision`:
  - `resolved` when all thresholds pass
  - `reopen` when any threshold fails or evidence is missing/invalid
- Fail-closed behavior is encoded directly in report summary and exit code.

3. CI/reporting enforcement and documentation convergence
- Added CI job `reliability-slo` in `.github/workflows/ci.yml`.
- CI now fails on reliability SLO threshold violations and uploads report evidence artifact.
- Updated `docs/metrics/compound-rate.md`, `README.md`, `AGENTS.md`, and `ROADMAP.md` with SLO policy/evidence mappings and closure references.

## Validation Evidence
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS
- `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-009-reliability-slo-gates-and-auto-reopen-policy-hooks-batch-1-plan.md`](../plans/bk-009-reliability-slo-gates-and-auto-reopen-policy-hooks-batch-1-plan.md)
- Review: [`docs/reviews/bk-009-reliability-slo-gates-and-auto-reopen-policy-hooks-batch-1-review.md`](../reviews/bk-009-reliability-slo-gates-and-auto-reopen-policy-hooks-batch-1-review.md)
- Solution: [`docs/solutions/reliability-slo-gates-with-auto-reopen-policy-hook.md`](../solutions/reliability-slo-gates-with-auto-reopen-policy-hook.md)

## Exit Criteria
- Deterministic SLO evaluator exists with explicit threshold pass/fail outputs and versioned report schema.
- Policy hook deterministically maps threshold violations to `consensus_lock_decision = reopen`.
- CI surfaces SLO failures as actionable gate failures with uploaded evidence artifact.
