# Plan: BK-002 Confidence-Based Human Escalation Tuning (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `BK-002`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - `confidence.gate` writes deterministic `confidence_result.json` artifacts per run.
  - There is no first-class deterministic command to aggregate observed confidence behavior across runs and produce threshold/route tuning guidance.
- Target behavior:
  - Add an optional CLI command that analyzes historical confidence artifacts and emits deterministic threshold and escalation-target recommendations per `confidence.gate` node.
  - Support machine-readable JSON output and optional report-file emission for auditability.
- Why this change is needed:
  - `BK-002` requires human escalation tuning driven by observed run data instead of ad hoc manual inspection.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Confidence gate runtime artifacts | `packages/core/src/handlers/builtin.ts` | Writes per-node `confidence_result.json` with observed score, threshold, decision, escalation target | Existing deterministic artifact is suitable as tuning input |
| CLI surface | `packages/cli/src/index.ts` | Provides operational helper commands (`manifest`, `dtu-run`) with text/JSON outputs | Natural extension point for confidence tuning helper |
| CLI regression coverage | `packages/cli/src/e2e-smoke.test.ts` | Covers run/resume/replay/manifest/dtu commands | Add confidence tuning command assertions |
| Roadmap/process docs | `ROADMAP.md`, `README.md` | `BK-002` listed in backlog with tuning exit criterion | Must update status and command docs on completion |

## External Constraints
- Runtime/environment constraints:
  - Output must remain deterministic and CI-friendly.
  - Command must not require network access.
- Backward compatibility constraints:
  - Additive command only; no breaking schema change to existing artifacts.

## Design Outline
- Proposed approach:
  - Add `factorial confidence-tune` command with:
    - required `--logs-root <path...>`
    - optional `--target-escalation-rate <0..1>`
    - optional `--min-samples <n>`
    - optional `--output <path>`
    - optional `--json`
  - Recursively scan logs roots for `confidence_result.json`, parse valid records, and group by `node_id`.
  - Emit deterministic per-node recommendations:
    - recommended threshold based on observed-confidence quantile at target escalation rate,
    - recommended escalation target by most frequent escalation route,
    - sample sufficiency status based on `min_samples`.
  - Add e2e smoke test with synthetic confidence artifact fixtures to validate JSON output.
  - Update roadmap/process artifacts and README.
- Rejected alternatives and why:
  - Automatic in-place DOT rewriting: too invasive for a low-risk bounded batch.
  - Runtime auto-adjustment of thresholds: out of scope without governance controls.
- Affected interfaces and contracts:
  - New CLI command only; existing run artifacts remain unchanged.

## Edge Cases
- Edge case 1:
  - Logs roots include malformed artifacts; command should ignore invalid records and report deterministic warning entries.
- Edge case 2:
  - Very small sample sets; command should mark recommendations as `insufficient_samples`.
- Failure mode handling:
  - Explicit non-zero exit when input arguments are invalid or no valid artifacts are found.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK002-INV-01 | Existing execution semantics for `confidence.gate` must not change | Implement additive analysis command only; no handler decision-path changes | Existing confidence handler/engine tests remain green |
| BK002-INV-02 | Tuning output must be deterministic from the same artifact set | Stable path sorting, deterministic tie-breakers, numeric rounding | New CLI e2e test asserts JSON contract and recommendation values |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK002-01` confidence tuning command and deterministic JSON contract
  - `BK002-02` threshold/route recommendation logic from observed run artifacts
  - `BK002-03` docs + roadmap convergence and completion artifacts
- Implementer scope statement (batch-limited):
  - Implement command, tests, and batch documentation only for `BK-002`.
- Verifier scope statement (batch-only):
  - Verify only selected issue IDs with explicit pass/fail evidence; no new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
