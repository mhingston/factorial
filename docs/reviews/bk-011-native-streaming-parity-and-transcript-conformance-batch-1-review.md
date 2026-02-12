# Review: BK-011 Native Streaming Parity and Transcript Conformance (Batch 1)

## Metadata
- Date: 2026-02-12
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-011` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK011-01` | reliability | `P1` | `high` | `in-batch` | `packages/core/src/llm/index.ts:25` | Stream path still behaved like a single-shot wrapper and did not provide native delta flow for supported backends. |
| `BK011-02` | correctness | `P1` | `high` | `in-batch` | `packages/core/src/llm/index.test.ts:57` | No deterministic parity proof existed that `accumulate(stream)` equals normalized `complete` output across targeted API/CLI paths. |
| `BK011-03` | operability | `P1` | `high` | `in-batch` | `packages/core/src/handlers/builtin.ts:435` | Codergen stages lacked deterministic stream transcript artifacts and provenance mapping, weakening conformance evidence reuse. |
| `BK011-04` | correctness | `P1` | `high` | `in-batch` | `packages/core/src/llm/index.test.ts:147` | Cancellation/error conformance coverage for stream flows was incomplete, leaving deterministic fail-path behavior under-tested. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK011-01`, `BK011-02`, `BK011-03`, `BK011-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-011 required stream contract hardening, parity proof, transcript evidence publication, and explicit cancellation/error conformance in one bounded reliability/correctness batch.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK011-01` | `pass` | Added native incremental stream support for API text (`streamText`) and deterministic CLI stream delta flow with normalized `llm.stream.end` metadata (`packages/core/src/llm/index.ts:39`, `packages/core/src/llm/index.ts:348`, `packages/core/src/llm/index.ts:389`). | None |
| `BK011-02` | `pass` | Added deterministic parity tests for API and CLI proving `accumulate(stream)` equals `complete` output (`packages/core/src/llm/index.test.ts:57`, `packages/core/src/llm/index.test.ts:116`). | None |
| `BK011-03` | `pass` | Added deterministic codergen transcript artifacts (`stream_transcript.json` + `.ndjson`) and mapped additive tooling fields into run manifest provenance (`packages/core/src/handlers/builtin.ts:435`, `packages/core/src/handlers/builtin.ts:1174`, `packages/cli/src/index.ts:172`, `packages/cli/src/index.ts:1041`, `packages/cli/src/e2e-smoke.test.ts:108`). | None |
| `BK011-04` | `pass` | Added explicit stream cancellation/error conformance tests and verified deterministic required command suite pass (`packages/core/src/llm/index.test.ts:147`, `packages/core/src/llm/index.test.ts:173`; `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run test:golden`, `npm run self-host:maturity -- --require-level deterministic-local`, `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - BK-011 selected issues are implemented with native stream delta flow, parity conformance tests, deterministic transcript evidence publication/provenance mapping, and explicit cancellation/error verification with required CI-floor commands passing.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-plan.md`](../plans/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-plan.md)
- Solution: [`docs/solutions/native-stream-delta-parity-and-codergen-transcript-conformance.md`](../solutions/native-stream-delta-parity-and-codergen-transcript-conformance.md)
- Completion report: [`docs/roadmap/backlog-bk-011-native-streaming-parity-and-transcript-conformance-completion.md`](../roadmap/backlog-bk-011-native-streaming-parity-and-transcript-conformance-completion.md)
