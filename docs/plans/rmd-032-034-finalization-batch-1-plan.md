# Plan: RMD-032/033/034 Finalization Batch 1

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-032`, `RMD-033`, `RMD-034`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - Runtime and lint implementation for judge rubric scoring, targeted retry taxonomy routing, and promotion/profile governance already exist and are covered by tests.
  - `ROADMAP.md` still marks `RMD-032`, `RMD-033`, and `RMD-034` as Planned and has not converged to completion artifacts.
  - Targeted retry taxonomy and judge explainability coverage can be made more explicit with focused regression assertions.
- Target behavior:
  - Close out `RMD-032/033/034` with bounded finalization artifacts, deterministic verification evidence, roadmap status updates, and a 0.3 completion report.
  - Add focused regression checks to improve confidence in failure taxonomy routing and judge explainability context outputs.
- Why this change is needed:
  - Remove roadmap/status ambiguity and ratchet these items to `resolved` with reproducible evidence.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Judge maturity | `packages/core/src/handlers/builtin.ts`, `packages/core/src/handlers/builtin.test.ts`, `tests/golden/workflows/judge-rubric.dot` | `judge.rubric` delegates to codergen with required rubric/threshold, emits score context updates | Add explicit assertions for explainability fields in tests |
| Targeted retry | `packages/core/src/engine/index.ts`, `packages/core/src/engine/targeted-retry.test.ts`, `tests/golden/workflows/targeted-retry-routing.dot` | Targeted policy + failure class routing exist | Add explicit class coverage for `quality_gap` and `spec_mismatch` map routing |
| Governance profiles | `packages/core/src/lint/index.ts`, `packages/core/src/lint/index.test.ts`, `tests/golden/workflows/promotion-regulated.dot` | Promotion/profile overlays enforced by lint and exercised in golden suite | Evidence is sufficient; finalization/doc convergence needed |
| Roadmap and completion docs | `ROADMAP.md`, `docs/roadmap/*.md` | `RMD-032/033/034` still listed as Planned | Add dedicated completion report and link it consistently |

## External Constraints
- Runtime/environment constraints:
  - Keep verification deterministic and CI-friendly (`llm_backend=cli` for golden workflows).
- Backward compatibility constraints:
  - No runtime contract changes; only additive test/docs finalization.

## Design Outline
- Proposed approach:
  - Add focused test coverage:
    - targeted retry: `quality_gap` classification route and `retry_target_map` (`spec_mismatch`) route.
    - judge rubric: assert explainability fields (`score_threshold`, `rubric_path`, `score_weights`, explanatory notes).
  - Create bounded process artifacts (plan/review/solution) and a 0.3 completion report for `RMD-032/033/034`.
  - Update `ROADMAP.md` and 0.3 execution plan status sections to Done with links, avoiding duplicated roadmap items.
- Rejected alternatives and why:
  - Docs-only closeout without focused test additions: rejected to avoid claiming maturity without explicit regression evidence for all targeted taxonomy paths.
- Affected interfaces and contracts:
  - None (behavior unchanged); stronger regression assertions only.

## Edge Cases
- Edge case 1:
  - Failure classification sources can come from context or fallback heuristics; tests should validate deterministic fallback behavior.
- Edge case 2:
  - Judge explainability fields may regress silently if output contract changes; explicit test assertions reduce that risk.
- Failure mode handling:
  - Any failing validation reopens the batch (`reopen`) and blocks roadmap closeout.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD-032-034-I1 | Finalization does not change execution semantics | Limit runtime edits to test assertions; no handler/engine behavior changes | `npm run test:run`, `npm run test:golden` stay green |
| RMD-032-034-I2 | Targeted retry class routing remains explicit | Add regression tests for additional classes and map path | `packages/core/src/engine/targeted-retry.test.ts` pass |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `RMD-032F-01`
  - `RMD-033F-01`
  - `RMD-034F-01`
- Implementer scope statement (batch-limited):
  - Finalize roadmap state and evidence for `RMD-032/033/034` plus focused regression additions only.
- Verifier scope statement (batch-only):
  - Verify only `RMD-032F-01`, `RMD-033F-01`, `RMD-034F-01` with explicit pass/fail command evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
