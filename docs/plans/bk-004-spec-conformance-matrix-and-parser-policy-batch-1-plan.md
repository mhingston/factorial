# Plan: BK-004 Spec-Conformance Matrix + Parser Policy Closure (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `BK-004`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - Parser behavior already enforces `digraph`-only input and rejects `graph` mode.
  - Tests already verify strict `digraph` parsing and non-`digraph` rejection.
  - No dedicated `docs/spec-conformance-matrix.md` artifact exists to map active Attractor/coding-agent-loop/unified-llm deltas to test evidence.
  - User docs do not yet explicitly codify parser policy decision in a single auditable location.
- Target behavior:
  - Add `docs/spec-conformance-matrix.md` mapping active deltas and closure status to concrete tests/docs.
  - Explicitly document parser policy decision: reject undirected `graph` mode, accept `digraph` / `strict digraph`.
  - Update roadmap/docs to reference the matrix and mark `BK-004` complete.
- Why this change is needed:
  - `BK-004` requires an auditable external-spec conformance artifact and explicit parser policy closure.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Parser policy | `packages/dot-parser/src/dot.pegjs`, `packages/dot-parser/src/parser-wrapper.test.ts` | Grammar accepts only `digraph`; test validates `graph` rejection + `strict digraph` acceptance | Behavior implemented; docs/matrix closure pending |
| Exit-node / restart semantics | `packages/core/src/lint/index.ts`, `packages/core/src/lint/index.test.ts`, `packages/core/src/engine/loop-restart.test.ts` | Exactly-one-exit and loop restart boundary semantics covered | Useful matrix evidence rows |
| Companion spec boundaries | `packages/core/src/llm/index.test.ts`, `packages/core/src/handlers/codergen.test.ts`, `packages/cli/src/self-host-dogfood.test.ts` | Adapter stream/parity and bounded self-host loop behavior covered | Map deltas and open follow-up IDs |
| Roadmap/docs | `ROADMAP.md`, `README.md` | `BK-004` backlog criteria defined, but matrix link absent | Update cross-references and status |

## External Constraints
- Runtime/environment constraints:
  - Documentation and matrix should be deterministic and source-backed.
- Backward compatibility constraints:
  - Parser behavior itself should not change in this batch.

## Design Outline
- Proposed approach:
  - Create `docs/spec-conformance-matrix.md` with:
    - active delta IDs,
    - spec source (`attractor`, `coding-agent-loop`, `unified-llm`),
    - repo decision/status (`closed`/`open`),
    - concrete evidence tests/docs and follow-up backlog IDs.
  - Update README parser compatibility notes with explicit strict policy wording.
  - Update roadmap artifacts/status to close `BK-004` and set next execution to `BK-005`.
- Rejected alternatives and why:
  - Changing parser runtime behavior in this batch: rejected (already implemented and tested).
  - Creating matrix without explicit test links: rejected (not auditable).
- Affected interfaces and contracts:
  - Documentation contract only (`spec-conformance-matrix` artifact + references).

## Edge Cases
- Edge case 1:
  - Avoid over-claiming companion-spec full conformance where adoption is intentionally partial.
- Edge case 2:
  - Keep strict parser policy statement precise (`digraph`/`strict digraph` accepted; `graph` rejected).
- Failure mode handling:
  - If evidence mapping is ambiguous, mark row as open with explicit follow-up issue ID.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK004-INV-01 | Parser policy remains strict `digraph`-only | No parser code changes; document current policy and test evidence | `packages/dot-parser/src/parser-wrapper.test.ts` remains green |
| BK004-INV-02 | Matrix claims are auditable and bounded | Every row includes explicit evidence link(s) and status | Review artifact verifies only selected BK-004 IDs |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK004-01` publish spec-conformance matrix artifact with evidence mapping
  - `BK004-02` resolve strict digraph policy declaration in docs (`reject graph`, accept `digraph`/`strict digraph`)
  - `BK004-03` roadmap/process artifact convergence for backlog closure
- Implementer scope statement (batch-limited):
  - Implement docs/matrix + roadmap closure only for `BK-004`; no runtime behavior changes.
- Verifier scope statement (batch-only):
  - Verify selected issue IDs only with pass/fail evidence; no new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
