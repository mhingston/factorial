# Plan: BK-009 Reliability SLO Gates and Auto-Reopen Policy Hooks (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-009`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - Weekly compound metrics are generated (`compound-weekly`), but no deterministic SLO evaluator enforces objective thresholds over those metrics.
  - Consensus lock checks exist for PR body structure, but there is no automated policy hook that deterministically maps SLO violations to `reopen`.
  - CI does not expose reliability-SLO threshold failures as a dedicated actionable gate.
- Target behavior:
  - Add deterministic reliability SLO evaluator/report contract over weekly compound metrics artifacts.
  - Add explicit policy decision hook that emits `resolved|reopen` based on threshold outcomes (fail closed on invalid/missing evidence).
  - Add CI/reporting gate command so SLO violations fail the pipeline with machine-readable evidence artifacts.
  - Update metrics/roadmap documentation and completion references for BK-009 closure.
- Why this change is needed:
  - `BK-009` is the active backlog item and is required to prevent silent process-quality regressions before later verification/autonomy milestones.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Weekly metrics generation | `packages/cli/src/index.ts`, `scripts/compound-weekly-report.js` | Emits weekly markdown and optional JSON payload with `reopen_rate` and artifact counts | Existing deterministic metrics logic is reusable as the SLO evaluator input |
| PR/process policy hooks | `scripts/check-pr-compound-artifacts.js` | Enforces plan/review/compound links + explicit consensus lock field in PR body | Needs deterministic SLO-driven lock decision companion hook, not just field presence |
| CI gates | `.github/workflows/ci.yml` | Runs lint/typecheck/tests/golden/maturity/release-hardening, no reliability SLO gate | Add dedicated job and artifact upload |
| Existing docs/contracts | `docs/metrics/compound-rate.md`, `ROADMAP.md`, `README.md` | Defines compound metrics but no explicit SLO thresholds and fail/reopen decision contract | Must document thresholds, evidence mapping, and closure refs |

## External Constraints
- Runtime/environment constraints:
  - Must run deterministically in local CI-like execution without network dependencies.
- Process constraints:
  - Must preserve ratchet rule and not weaken deterministic-local maturity gate requirements.
- Backward compatibility constraints:
  - Existing `compound-weekly` behavior and report generation should remain compatible for current docs/flows.

## Design Outline
- Proposed approach:
  - Add `scripts/reliability-slo-gate.js` with deterministic contract output `compound_reliability_slo_report.v1`.
  - Evaluate minimum BK-009 thresholds:
    - lock-resolution rate minimum,
    - reopen ratio maximum,
    - cadence freshness maximum age of weekly artifact.
  - Produce policy decision field `consensus_lock_decision` set to `reopen` when any threshold fails; otherwise `resolved`.
  - Publish default report path: `docs/metrics/reports/compound-reliability-slo-latest.json`.
  - Add npm command `npm run reliability:slo`.
  - Add tests covering pass path and fail-closed reopen path.
  - Add CI job to run reliability SLO gate and upload report artifact.
  - Update docs and roadmap completion references.
- Rejected alternatives and why:
  - Manual lock-decision interpretation from weekly markdown only: rejected; not deterministic enough for CI gating.
  - Embedding SLO policy directly into PR body checker: rejected; would couple runtime reliability evidence with text-format validation and reduce reuse.
- Affected interfaces and contracts:
  - New report schema: `compound_reliability_slo_report.v1`.
  - New command: `npm run reliability:slo`.
  - New policy hook output: `consensus_lock_decision: resolved|reopen`.

## Edge Cases
- Edge case 1:
  - No review artifacts/lock decisions in range; evaluator must fail closed (`reopen`) with explicit reason.
- Edge case 2:
  - Missing/stale weekly metrics artifact; evaluator must fail closed and surface cadence failure.
- Failure mode handling:
  - Always attempt to emit report artifact with failing checks and deterministic decision, then exit non-zero.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK009-INV-01 | Reliability SLO evaluation cannot silently pass with missing/invalid evidence | Fail closed when metrics artifact is missing, malformed, stale, or lacks lock-decision denominator | Negative-path test + command exit non-zero evidence |
| BK009-INV-02 | SLO policy decision is deterministic for identical inputs | Stable parsing, fixed threshold comparison, explicit `resolved|reopen` output in report schema | Repeat run over same inputs yields identical decision/checks |
| BK009-INV-03 | CI exposes SLO violations as actionable gate failures | Dedicated CI job runs evaluator and fails on threshold violations while uploading report artifact | CI workflow hook + local command proof |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK009-01` Add deterministic reliability SLO evaluator/report contract with threshold checks over weekly compound metrics.
  - `BK009-02` Add deterministic auto-reopen policy hook output (`consensus_lock_decision`) tied to SLO checks.
  - `BK009-03` Add CI/reporting enforcement and regression tests for pass and fail-closed paths.
  - `BK009-04` Converge metrics/roadmap/process docs and completion references for BK-009 closure.
- Implementer scope statement (batch-limited):
  - Implement only `BK009-01` through `BK009-04` for BK-009 batch 1.
- Verifier scope statement (batch-only):
  - Verify only `BK009-01` through `BK009-04` with pass/fail evidence; do not introduce new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
