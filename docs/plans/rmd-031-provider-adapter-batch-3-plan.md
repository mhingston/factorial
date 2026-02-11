# Plan: RMD-031 Provider Adapter Batch 3

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-031` (`PKG-031A`)
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - `stream()` is now implemented and integration baseline is green, but roadmap closure still calls for explicit parity evidence across at least two providers/backends.
  - Existing tests validate provider-specific behavior but do not assert normalized parity outcomes across providers through the codergen execution path.
- Target behavior:
  - Add deterministic test evidence that equivalent codergen runs normalize outputs consistently across at least two API providers.
  - Preserve existing adapter contract and artifact shape with no runtime behavior regressions.
- Why this change is needed:
  - `RMD-031` exit criteria requires provider/back-end parity evidence before closure.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| codergen adapter integration tests | `packages/core/src/handlers/codergen.test.ts` | tests provider config/defaults but not parity assertion across providers | add API parity scenario for `openai` + `anthropic` |
| llm adapter provider resolver | `packages/core/src/llm/index.ts` | supports `openai`, `anthropic`, `google`, `github/copilot` | no code changes needed if test evidence suffices |
| roadmap close-out state | `ROADMAP.md` | `RMD-031` still marked in progress pending parity evidence | update status only after green verification |

## External Constraints
- API/provider constraints:
  - Provider tests must remain mocked and deterministic; no network calls.
- Runtime/environment constraints:
  - Keep the existing CI command set unchanged.
- Backward compatibility constraints:
  - No changes to artifact schema or graph execution semantics.

## Design Outline
- Proposed approach:
  - Add a codergen integration test that runs equivalent API codergen executions with `openai` and `anthropic`.
  - Assert normalized parity on status, output mode, output value, usage summary, and adapter metadata.
  - Run `lint`, `typecheck`, `test:run`, and `test:golden`.
  - If green, update roadmap and create review + reusable solution artifact.
- Rejected alternatives and why:
  - Live two-provider e2e calls: rejected due non-deterministic external dependencies and credentials.
  - New provider abstraction changes: rejected because no contract gap remains for this batch.
- Affected interfaces and contracts:
  - Test-only assertions on `CodergenHandler` normalized output contract.

## Edge Cases
- Edge case 1:
  - Providers may emit different metadata shapes; parity assertions must focus on normalized fields only.
- Edge case 2:
  - Token fields may differ by raw naming (`inputTokens` vs `input_tokens`); normalization extraction should still match.
- Failure mode handling:
  - If parity assertions fail, keep `RMD-031` in-progress and document as reopened in review lock.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD031-INV-05 | Equivalent API codergen runs produce equivalent normalized outputs across providers | add deterministic two-provider parity test through `CodergenHandler` | `npm run test:run` |
| RMD031-INV-06 | Close-out evidence must be from one checkout with green baseline | run full validation checklist in same working tree | `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run test:golden` |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `RMD-031E-01` provider parity evidence gap
- Implementer scope statement (batch-limited):
  - Implement only `RMD-031E-01` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `RMD-031E-01` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
