# Backlog BK-013 Claims-Consistency Guardrails Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-013` (Claims-consistency guardrails across roadmap/spec/maturity docs)

## Implemented Capabilities
1. Deterministic claims-audit command/report contract
- Added deterministic command:
  - `npm run claims:audit`
- Added script:
  - `scripts/claims-consistency-audit.js`
- Report schema:
  - `claims_consistency_report.v1`
- Report checks:
  - source document readability (`CLM-001`)
  - current maturity level consistency (`CLM-002`)
  - next-level target consistency (`CLM-003`)
  - targeted delta status consistency (`CLM-004`)
  - unattended-autonomy scope consistency (`CLM-005`)

2. Fixture-backed pass/fail regression coverage
- Added compliant fixtures:
  - `tests/fixtures/claims-audit/*.compliant.md`
- Added mismatch fixture:
  - `tests/fixtures/claims-audit/companion.mismatch-current-level.md`
- Added regression tests:
  - `packages/cli/src/claims-consistency-audit.test.ts`

3. CI fail-closed enforcement
- Added CI job:
  - `.github/workflows/ci.yml` -> `claims-consistency`
- CI executes:
  - `npm run claims:audit -- --report ./logs/claims_consistency_ci/report.json`
- CI uploads:
  - `claims-consistency-report` artifact

4. Claims convergence across source-of-truth docs
- Added machine-parseable claims anchors in `ROADMAP.md`.
- Updated companion scope current-level claim to match declared maturity (`provider-backed`).
- Published deterministic evidence artifact:
  - `docs/metrics/reports/claims-consistency-latest.json`

## Validation Evidence
- `npm run claims:audit -- --report ./docs/metrics/reports/claims-consistency-latest.json` -> PASS
- `npm run test:run -- packages/cli/src/claims-consistency-audit.test.ts` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS
- `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-013-claims-consistency-guardrails-batch-1-plan.md`](../plans/bk-013-claims-consistency-guardrails-batch-1-plan.md)
- Review: [`docs/reviews/bk-013-claims-consistency-guardrails-batch-1-review.md`](../reviews/bk-013-claims-consistency-guardrails-batch-1-review.md)
- Solution: [`docs/solutions/claims-consistency-guardrails-for-source-of-truth-docs.md`](../solutions/claims-consistency-guardrails-for-source-of-truth-docs.md)

## Exit Criteria
- CI now includes a fail-closed claims-consistency gate.
- Contradictory claim declarations across roadmap/spec/companion/maturity documents are blocked before merge.
- Compliant-pass and mismatch-fail behavior is reproducible via repository fixtures and command-line execution.
