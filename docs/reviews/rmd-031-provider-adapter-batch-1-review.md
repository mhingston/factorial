# Review: RMD-031 Provider Adapter Batch 1

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `RMD-031` batch 1 (`RMD-031A`, `RMD-031B`, `RMD-031C`)
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `RMD-031A` | architecture-correctness | P1 | high | in-batch | `packages/core/src/types/index.ts:92`, `packages/core/src/llm/index.ts:17` | Codergen provider execution contract was implicit in handler internals; add explicit adapter contract (`complete`, `stream`) and default implementation boundary. |
| `RMD-031B` | reliability-decoupling | P1 | high | in-batch | `packages/core/src/handlers/builtin.ts:157`, `packages/core/src/handlers/builtin.ts:297` | `CodergenHandler` directly invoked provider/backend logic; route invocation through adapter to keep handler orchestration backend-agnostic. |
| `RMD-031C` | observability-correctness | P1 | high | in-batch | `packages/cli/src/index.ts:134`, `packages/cli/src/index.ts:791` | Manifest provenance was too thin for cross-backend parity analysis; extend with adapter/operation/output usage-token breakdown and tooling artifact paths. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `RMD-031A`, `RMD-031B`, `RMD-031C`
- Deferred issue IDs: none
- Batch rationale:
  - One bounded pass establishes adapter foundation, codergen decoupling, and provenance normalization needed for future provider convergence work.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `RMD-031A` | pass | `packages/core/src/types/index.ts` adds `LlmAdapter` contract; `packages/core/src/llm/index.ts` implements default adapter with `complete` and explicit `stream` stub; `packages/core/src/llm/index.test.ts` validates stream stub contract. | none |
| `RMD-031B` | pass | `packages/core/src/handlers/builtin.ts` constructs adapter-backed `CodergenHandler` and routes both API/CLI calls through `this.llmAdapter.complete(...)`; `packages/core/src/handlers/codergen.test.ts` adds adapter-boundary test and keeps artifact behavior passing. | none |
| `RMD-031C` | pass | `packages/cli/src/index.ts` extends `model_provenance` shape and collection with adapter/operation/output/tooling and usage token breakdown; `packages/cli/src/e2e-smoke.test.ts` asserts new provenance fields for representative CLI workflow. | complete AT-06 cross-provider workflow parity closure in next batch |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any): none
- Lock rationale:
  - Selected issues are implemented and verified with `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run test:golden`.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/rmd-031-provider-adapter-batch-1-plan.md`](../plans/rmd-031-provider-adapter-batch-1-plan.md)
- Roadmap: [`ROADMAP.md`](../../ROADMAP.md)
