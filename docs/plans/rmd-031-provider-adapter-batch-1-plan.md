# Plan: RMD-031 Provider Adapter Batch 1

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-031` (`PKG-031A`)
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - `CodergenHandler` directly resolves provider SDK models and performs `generateText`/`generateObject` calls in handler logic.
  - CLI/backend execution logic is embedded in `builtin.ts`, coupling orchestration behavior with backend wiring.
  - Run manifest `model_provenance` captures provider/model/backend and limited usage/cost only.
- Target behavior:
  - A minimal LLM adapter contract (`complete`, `stream`) exists and codergen calls are routed through it.
  - `CodergenHandler` orchestration remains stable while provider/backend invocation details are isolated in `packages/core/src/llm/`.
  - Manifest provenance includes stable adapter/operation/output/tool metadata plus richer usage/cost fields.
- Why this change is needed:
  - `RMD-031` requires provider-aligned convergence without rewriting graph execution semantics.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| codergen execution | `packages/core/src/handlers/builtin.ts` | direct provider imports + API/CLI call wiring inside handler | extract invocation boundary into adapter module |
| codergen tests | `packages/core/src/handlers/codergen.test.ts` | validates artifacts and provider selection behavior | add adapter-boundary assertion and preserve existing behavior checks |
| run manifest/provenance | `packages/cli/src/index.ts` | provenance has backend/provider/model/reasoning + total tokens/cost | extend schema for adapter/operation/output/tooling metadata and token breakdown |
| CLI smoke coverage | `packages/cli/src/e2e-smoke.test.ts` | checks manifest exists and model_provenance is array | assert new provenance field shape for representative workflow |

## External Constraints
- API/provider constraints:
  - Existing `@ai-sdk/*` and CLI provider mappings must keep current behavior.
- Runtime/environment constraints:
  - Keep deterministic artifact paths and context keys for replay/verification.
- Backward compatibility constraints:
  - Maintain codergen node status/output semantics and existing golden workflow outcomes.

## Design Outline
- Proposed approach:
  - Add adapter contract types to `packages/core/src/types/index.ts`.
  - Add default adapter implementation under `packages/core/src/llm/` with:
    - `complete()` for `api|cli`
    - `stream()` explicit not-implemented stub.
  - Inject adapter into `CodergenHandler` (default to new adapter) and replace direct invocation calls.
  - Extend codergen context updates for adapter/provenance hints.
  - Extend CLI manifest provenance shape + collection logic and add smoke assertions.
- Rejected alternatives and why:
  - Full provider registry rewrite: rejected (too broad for bounded batch).
  - Manifest schema version bump now: rejected (not needed for additive fields in this batch).
- Affected interfaces and contracts:
  - `LlmAdapter` contract in core types.
  - `RunManifest.model_provenance[*]` additive fields for adapter/usage/tool metadata.

## Edge Cases
- Edge case 1:
  - Unsupported provider should still fail deterministically with explicit error.
- Edge case 2:
  - Structured output with schema must keep validation behavior for both API and CLI backends.
- Failure mode handling:
  - Adapter call errors propagate as codergen `FAIL` with existing artifact/status behavior.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD031-INV-01 | Codergen handler orchestration must not directly call provider SDKs | route all model invocations through `LlmAdapter.complete()` | codergen adapter-boundary unit test + lint/typecheck/test suite |
| RMD031-INV-02 | Provenance fields remain stable across backends/providers | additive normalized manifest fields populated from codergen context keys | CLI smoke test asserts new provenance shape |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `RMD-031A` adapter contract + module (`complete`, `stream` stub)
  - `RMD-031B` codergen routing through adapter boundary
  - `RMD-031C` manifest/provenance mapping extension for usage/cost/tool metadata
- Implementer scope statement (batch-limited):
  - Implement only `RMD-031A`, `RMD-031B`, and `RMD-031C` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `RMD-031A`, `RMD-031B`, and `RMD-031C` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
