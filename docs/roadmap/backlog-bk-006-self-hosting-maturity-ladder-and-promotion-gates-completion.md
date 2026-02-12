# Backlog BK-006 Self-hosting Maturity Ladder and Promotion Gates Completion

Last updated: 2026-02-11

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-006` (Self-hosting maturity ladder and promotion gates)

## Implemented Capabilities
1. Executable maturity gate runner + report contract
- Added `scripts/self-host-maturity.js` with objective gate evaluation across:
  - `deterministic-local` (`DL-001`..`DL-003`)
  - `provider-backed` (`PB-001`..`PB-002`)
  - `autonomous` (`AU-001`..`AU-002`)
- Added npm command:
  - `npm run self-host:maturity`
- Emits deterministic artifacts:
  - JSON: `self_host_maturity_report.v1`
  - Markdown summary report

2. CI/reporting hook adoption
- Added CI job `self-host-maturity` in `.github/workflows/ci.yml`.
- CI enforces `--require-level deterministic-local` and uploads report artifacts.

3. Maturity ladder declaration and roadmap/spec convergence
- Added `docs/self-hosting-maturity-ladder.md` with:
  - explicit level definitions,
  - objective gate catalog,
  - declared current level (`deterministic-local`),
  - required criteria for next level (`provider-backed`).
- Updated conformance matrix (`CAL-DELTA-02`) and README/ROADMAP/AGENTS references to align with executable maturity policy.

## Validation Evidence
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-plan.md`](../plans/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-plan.md)
- Review: [`docs/reviews/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-review.md`](../reviews/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-review.md)
- Solution: [`docs/solutions/self-hosting-maturity-ladder-and-objective-promotion-gates.md`](../solutions/self-hosting-maturity-ladder-and-objective-promotion-gates.md)

## Exit Criteria
- Staged maturity levels (`deterministic-local`, `provider-backed`, `autonomous`) are formally defined.
- Objective promotion gates are executable and machine-reported.
- Current level and next-level criteria are explicit and auditable.
- CI enforces current-level maturity requirement.
