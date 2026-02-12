# Backlog BK-011 Native Streaming Parity and Transcript Conformance Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-011` (Native streaming parity and transcript conformance)

## Implemented Capabilities
1. Native stream delta contract for supported backends
- Updated `DefaultLlmAdapter.stream()` to emit native incremental stream events for supported paths with deterministic end metadata:
  - `llm.stream.start`
  - `llm.stream.delta`
  - `llm.stream.end`
  - `llm.stream.error`
- API text mode now streams via `streamText` token/delta flow.
- CLI mode now emits deterministic line-oriented delta events and normalized end metadata.

2. Deterministic stream-vs-complete parity verification
- Added stream parity tests that prove `accumulate(stream)` equals normalized `complete` output for API and CLI targets.
- Added cancellation/error conformance tests for deterministic fail-path evidence.

3. Codergen transcript artifact publication and provenance mapping
- Added deterministic codergen transcript artifacts:
  - `<stage>/stream_transcript.json`
  - `<stage>/stream_transcript.ndjson`
- Added transcript path propagation in codergen context updates.
- Extended run manifest provenance tooling to include transcript path fields:
  - `tooling.stream_transcript_path`
  - `tooling.stream_transcript_ndjson_path`

4. Documentation/process convergence
- Added BK-011 plan/review/solution artifacts.
- Updated roadmap status/queue and spec-conformance matrix evidence references.

## Validation Evidence
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS
- `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-plan.md`](../plans/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-plan.md)
- Review: [`docs/reviews/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-review.md`](../reviews/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-review.md)
- Solution: [`docs/solutions/native-stream-delta-parity-and-codergen-transcript-conformance.md`](../solutions/native-stream-delta-parity-and-codergen-transcript-conformance.md)

## Exit Criteria
- Streaming parity suite passes for targeted API/CLI backends with deterministic pass/fail outcomes.
- Stream transcript artifacts are deterministically published for codergen stages and surfaced in run manifest provenance tooling.
