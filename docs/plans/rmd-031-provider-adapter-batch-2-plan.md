# Plan: RMD-031 Provider Adapter Batch 2

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-031` (`PKG-031A`)
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - Adapter boundary is introduced, but integration is incomplete and the repository is not buildable (`npm run build` / `npm run typecheck` failing).
  - `CodergenHandler` still contains superseded inline helper code that is no longer used and now causes compile-time drift.
  - CLI e2e smoke setup fails early because build fails.
- Target behavior:
  - Adapter integration is internally consistent and legacy helper paths removed/retired.
  - `npm run build`, `npm run typecheck`, and `npm run test:run` pass in the same checkout.
  - Existing codergen artifact/manifest behavior remains stable.
- Why this change is needed:
  - `RMD-031` cannot converge until the adapter batch is operationally green and verifiable.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| codergen orchestration | `packages/core/src/handlers/builtin.ts` | adapter path added but dead legacy helpers remain | remove superseded code and keep adapter-only invocation path |
| llm adapter module | `packages/core/src/llm/index.ts` | provides `complete()` + stream stub | fix CLI request narrowing/type safety |
| e2e execution gate | `packages/cli/src/e2e-smoke.test.ts` | fails when build fails | should recover once build/typecheck regressions are fixed |

## External Constraints
- API/provider constraints:
  - Preserve current provider behavior (`openai`, `anthropic`, `google`, `github`) and CLI defaults.
- Runtime/environment constraints:
  - Keep artifact paths and context keys deterministic.
- Backward compatibility constraints:
  - Do not change graph semantics or status routing behavior in this batch.

## Design Outline
- Proposed approach:
  - Remove obsolete codergen helper functions that were superseded by `LlmAdapter.complete()`.
  - Keep all codergen API/CLI execution routed through adapter calls.
  - Fix adapter type narrowing for CLI invocation path.
  - Re-run lint/typecheck/tests and capture pass/fail evidence.
- Rejected alternatives and why:
  - Expanding to stream implementation in this batch: deferred to keep scope bounded to integration recovery.
  - Refactoring manifest schema further: deferred to avoid moving target while restoring green baseline.
- Affected interfaces and contracts:
  - `CodergenHandler` adapter integration contract.
  - `DefaultLlmAdapter.complete()` type contract for CLI requests.

## Edge Cases
- Edge case 1:
  - Structured output mode remains valid for both API and CLI backends after helper removal.
- Edge case 2:
  - Provider default CLI mappings continue to run without SDK provider calls in CLI mode.
- Failure mode handling:
  - Adapter call errors continue to return deterministic codergen `FAIL` outcomes with artifacts.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD031-INV-03 | Build/typecheck/test baseline must be green before batch closure | remove integration drift and invalid dead code | `npm run build`, `npm run typecheck`, `npm run test:run` |
| RMD031-INV-04 | Codergen execution remains adapter-boundary only | no direct provider invocation in handler orchestration | codergen tests + grep check over handler module |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `RMD-031D` integration drift cleanup and baseline restore
- Implementer scope statement (batch-limited):
  - Implement only `RMD-031D` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `RMD-031D` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
