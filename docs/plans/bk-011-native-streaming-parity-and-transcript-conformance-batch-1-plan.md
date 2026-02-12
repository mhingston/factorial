# Plan: BK-011 Native Streaming Parity and Transcript Conformance (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-011`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - `DefaultLlmAdapter.stream()` is a single-shot wrapper around `complete()` and emits one full payload event instead of incremental deltas.
  - There is no explicit parity proof that `accumulate(stream)` equals `complete` normalized output for targeted backends/providers.
  - Codergen stage artifacts do not persist stream transcript files and run manifest provenance does not map transcript paths.
  - Stream cancellation/error conformance coverage is minimal.
- Target behavior:
  - Implement incremental stream event flow (`start`/`delta`/`end`) for supported backends.
  - Add deterministic stream-vs-complete parity tests for targeted providers/backends.
  - Persist deterministic codergen stream transcript artifacts and expose transcript paths via run manifest provenance tooling.
  - Add explicit cancellation/error conformance checks with deterministic pass/fail assertions.
- Why this change is needed:
  - `BK-011` is the active queue head after BK-010 and is required before autonomous evidence bootstrap (`BK-012`).

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Adapter stream implementation | `packages/core/src/llm/index.ts`, `packages/core/src/llm/index.test.ts` | Emits `start` + one text/object payload + `end/error` using `complete()` | Must become incremental and parity-tested |
| Codergen artifacts | `packages/core/src/handlers/builtin.ts`, `packages/core/src/handlers/codergen.test.ts` | Writes prompt/response/events/usage artifacts, no stream transcript artifact | Add deterministic transcript files and context keys |
| Manifest provenance | `packages/cli/src/index.ts`, `packages/cli/src/e2e-smoke.test.ts` | Provenance tooling paths include API/CLI invocation/stdout/stderr only | Extend tooling contract for transcript paths |
| Roadmap/docs | `ROADMAP.md`, `README.md`, `docs/spec-conformance-matrix.md` | BK-011 listed as backlog; no transcript conformance references | Converge docs and closure references |

## External Constraints
- Runtime/environment constraints:
  - Must remain deterministic and CI-friendly across Node 20/22.
  - No dependency on network for regression tests.
- Process constraints:
  - Implement only BK-011 scoped IDs in this batch.
  - Keep ratchet rule intact (no new critique during verification).
- Backward compatibility constraints:
  - Existing codergen output/validation artifacts and CLI manifest schema remain compatible (additive fields only).

## Design Outline
- Proposed approach:
  - Upgrade `DefaultLlmAdapter.stream()` to emit incremental `delta` events for supported text backends while retaining normalized end metadata.
  - Add stream accumulator helper tests proving stream-complete equivalence for targeted API/CLI parity cases.
  - Persist codergen stream transcript artifacts (`stream_transcript.json` + `.ndjson`) and map paths into `codergen.*` context updates.
  - Extend run manifest tooling with additive transcript path fields in provenance records.
  - Add cancellation/error stream conformance tests.
- Rejected alternatives and why:
  - Leaving stream wrapper behavior and documenting limitation: rejected because BK-011 explicitly requires native incremental flow.
  - Making transcript persistence optional behind flags: rejected because BK-011 requires reproducible conformance evidence by default.
- Affected interfaces and contracts:
  - Stream event contract: `llm.stream.start|delta|end|error` with deterministic payload shape.
  - Additive manifest tooling fields for transcript artifact paths.
  - Codergen artifact contract includes stream transcript publication paths.

## Edge Cases
- Edge case 1:
  - CLI subprocess emits empty stdout with non-zero exit; stream must still produce deterministic `end/error` evidence.
- Edge case 2:
  - Cancellation before/while streaming; stream must terminate deterministically with explicit error event.
- Failure mode handling:
  - Stream transcript artifacts should still be written when call reaches observable events; fail-closed when stream setup fails before event collection.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK011-INV-01 | Streamed text accumulation equals `complete()` normalized text for supported parity cases | Deterministic adapter stream implementation + parity tests | Stream parity tests for API and CLI backends |
| BK011-INV-02 | Codergen stream transcript artifacts are deterministic and mapped into provenance | Write transcript artifacts in stable order and map additive context/tooling paths | Codergen + e2e manifest provenance assertions |
| BK011-INV-03 | Stream cancellation/error paths are explicit and reproducible | Emit deterministic error events and assert pass/fail behavior in tests | Conformance tests for cancellation/error paths |
| BK011-INV-04 | Existing codergen run output semantics remain compatible | Keep output/status/validation paths unchanged while adding transcript evidence | Full `test:run` + `test:golden` regression pass |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK011-01` Implement incremental stream event flow (`start`/`delta`/`end`) for supported adapter backends.
  - `BK011-02` Add deterministic stream accumulator parity tests proving `accumulate(stream) == complete` for targeted parity cases.
  - `BK011-03` Persist deterministic codergen stream transcript artifacts and map transcript paths in run manifest provenance.
  - `BK011-04` Add stream cancellation/error conformance checks and converge roadmap/docs/process artifacts.
- Implementer scope statement (batch-limited):
  - Implement only `BK011-01` through `BK011-04` for BK-011 batch 1.
- Verifier scope statement (batch-only):
  - Verify only `BK011-01` through `BK011-04` with pass/fail evidence; do not introduce new issue IDs.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
