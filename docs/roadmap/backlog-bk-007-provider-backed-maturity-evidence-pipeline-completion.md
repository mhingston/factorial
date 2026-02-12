# Backlog BK-007 Provider-backed Maturity Evidence Pipeline Completion

Last updated: 2026-02-11

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-007` (Provider-backed maturity evidence pipeline)

## Implemented Capabilities
1. Deterministic provider-backed evidence publication
- Added `scripts/self-host-provider-backed-report.js` and npm command:
  - `npm run self-host:provider-backed`
- Publishes deterministic report artifact:
  - `docs/metrics/reports/self-host-provider-backed-latest.json`
- Report contract schema:
  - `self_host_provider_backed_report.v1`
- Includes objective provider status keys for:
  - `openai`
  - `anthropic`

2. Objective maturity-gate verification for provider-backed level
- Updated `scripts/self-host-maturity.js` provider-backed gates to verify published evidence:
  - `PB-001`: parity contract pass status from published report fields.
  - `PB-002`: published schema + required provider pass keys (`openai`, `anthropic`).
- Added `--provider-backed-report` override to keep gate verification deterministic and testable.
- Preserved CI default required-level gate:
  - `npm run self-host:maturity -- --require-level deterministic-local`

3. Maturity declaration and conformance convergence
- Updated `docs/self-hosting-maturity-ladder.md`:
  - declared current level -> `provider-backed`
  - declared next level -> `autonomous`
  - documented publication command for provider-backed evidence.
- Updated `docs/spec-conformance-matrix.md` and `README.md` command references for published evidence workflow.

## Validation Evidence
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-plan.md`](../plans/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-plan.md)
- Review: [`docs/reviews/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-review.md`](../reviews/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-review.md)
- Solution: [`docs/solutions/provider-backed-maturity-evidence-publication-and-gate-verification.md`](../solutions/provider-backed-maturity-evidence-publication-and-gate-verification.md)

## Exit Criteria
- Provider-backed report schema `self_host_provider_backed_report.v1` is published and reproducible.
- Deterministic publication path exists at `docs/metrics/reports/self-host-provider-backed-latest.json`.
- `PB-001` and `PB-002` are objectively verifiable from published evidence and pass from generated artifact.
- Deterministic-local CI gate requirement remains enforced.
