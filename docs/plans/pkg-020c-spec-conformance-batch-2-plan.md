# Plan: PKG-020C Spec Conformance Batch 2

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `PKG-020C` (`RMD-020`)
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - `loop_restart` edge handling emitted a restart signal but continued in-run without a fresh run segment.
  - `stack.manager_loop` lacked an optional local delegated child execution adapter hook.
- Target behavior:
  - `loop_restart` transitions execution into a fresh run segment with a distinct logs root and explicit restart boundary artifacts.
  - `stack.manager_loop` supports optional local child execution via adapter hook behind explicit node attribute control.
- Why this change is needed:
  - Closes the remaining `PKG-020C` spec deltas and completes `RMD-020` Phase C behavior in branch.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Restart semantics | `packages/core/src/engine/index.ts` | loop restart emitted restart event but reused same run context/log root | Implement segment boundary (`restart-XXX`) + restart metadata |
| Resume behavior | `packages/core/src/engine/resume.test.ts` | no segment-specific resume validation | Add coverage for restoring segment logs root |
| Manager local child execution | `packages/core/src/handlers/builtin.ts`, `packages/core/src/handlers/builtin.test.ts` | no local adapter hook | Add optional constructor-injected adapter + explicit enable flag |
| Docs | `README.md`, `docs/plans/rmd-020-subagent-orchestration-prd.md`, `ROADMAP.md` | Phase C listed as pending | Update docs and status references |

## External Constraints
- API/provider constraints:
  - Local child adapter must not require external network dependencies.
- Runtime/environment constraints:
  - Restart segments and manager artifacts must remain deterministic for CI.
- Backward compatibility constraints:
  - Existing manager workflows without local adapter remain unchanged.

## Design Outline
- Proposed approach:
  - Add engine run segment state (`run.segment_index`, `run.segment_logs_root`, `run.restart_count`) and boundary artifact `run_segments.json`.
  - On `loop_restart`, clone context, reset segment-local runtime state, switch logs root to `<logs_root>/restart-XXX`, emit `RUN_COMPLETE` (restart) then `RUN_START` (restart segment).
  - Add `ManagerLoopHandler` optional `childExecutionAdapter` and `manager_local_child_execution=true` gate.
  - Add deterministic unit tests for segment boundaries, restart limits, resume segment restoration, and manager local child execution.
- Rejected alternatives and why:
  - Full recursive engine instantiation per restart: rejected as unnecessary complexity for deterministic local boundary semantics.
  - Implicit local child execution by default: rejected to preserve existing manager behavior and avoid hidden side effects.
- Affected interfaces and contracts:
  - Engine event data and context keys for run segment metadata.
  - Manager handler constructor option (`childExecutionAdapter`) and node attribute `manager_local_child_execution`.

## Edge Cases
- Edge case 1:
  - Repeated `loop_restart` cycles exceeding configured limit.
- Edge case 2:
  - Resume from checkpoint saved inside a restart segment.
- Failure mode handling:
  - Engine fails with explicit error when max restarts are exceeded.
  - Manager fails fast when local execution is enabled without configured adapter.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| PKG020C-INV-03 | `loop_restart` creates explicit, replayable run boundaries | segment state + `run_segments.json` artifact + restart events | `packages/core/src/engine/loop-restart.test.ts` |
| PKG020C-INV-04 | Local child execution remains opt-in and deterministic | explicit node attribute gate + constructor-injected adapter | `packages/core/src/handlers/builtin.test.ts` local adapter tests |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `PKG-020C-03` `loop_restart` fresh-run boundary semantics
  - `PKG-020C-04` manager loop local child execution adapter hook
- Implementer scope statement (batch-limited):
  - Implement only `PKG-020C-03` and `PKG-020C-04` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `PKG-020C-03` and `PKG-020C-04` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
