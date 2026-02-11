# Plan: PKG-020C Spec Conformance Batch 1

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `PKG-020C` (`RMD-020`)
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - DOT parsing accepts both `digraph` and `graph` inputs.
  - Lint requires at least one exit node, not exactly one.
  - `loop_restart` semantics still continue in-run and do not establish a fresh run boundary.
  - Manager loop local child execution adapter hook remains pending.
- Target behavior:
  - Parsing rejects non-`digraph` definitions.
  - Lint fails when exit node count is not exactly one.
  - Batch 1 implements parser/lint conformance and leaves runtime adapter work explicitly deferred.
- Why this change is needed:
  - `PKG-020C` is the top roadmap execution item and requires concrete Attractor spec conformance before adding orchestration complexity.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| DOT grammar + wrapper | `packages/dot-parser/src/dot.pegjs`, `packages/dot-parser/src/parser.js`, `packages/dot-parser/src/parser-wrapper.ts`, `packages/dot-parser/src/parser-wrapper.test.ts` | Grammar currently allows `digraph` and `graph`; wrapper has no explicit conformance guard | Batch 1 enforces `digraph` only and adds rejection tests |
| Lint exit cardinality | `packages/core/src/lint/index.ts`, `packages/core/src/lint/index.test.ts` | Exit-node rule requires `>0` exits | Batch 1 updates to exact cardinality rule with deterministic diagnostics |
| Runtime restart semantics | `packages/core/src/engine/index.ts` | `loop_restart` path explicitly marked as in-run continuation | Deferred to next batch/subagent handoff |
| Manager loop Phase C | `packages/core/src/handlers/builtin.ts`, `packages/core/src/handlers/builtin.test.ts` | Delegation artifact exists; local child execution adapter hook not completed | Deferred to next batch/subagent handoff |

## External Constraints
- API/provider constraints:
  - None for parser/lint slice.
- Runtime/environment constraints:
  - Parsing and lint behavior must remain deterministic in CI.
- Backward compatibility constraints:
  - Existing valid `digraph` workflows must continue passing unchanged.

## Design Outline
- Proposed approach:
  - Tighten grammar/wrapper contract to reject non-`digraph` inputs with actionable parser errors.
  - Update lint `ExitNodeRule` to enforce exactly one exit node with count-aware message.
  - Add focused tests for parser rejection and exit-node cardinality.
- Rejected alternatives and why:
  - Enforcing `digraph` only in lint: rejected because parser-level contract should fail early.
  - Leaving “at least one exit” and relying on runtime behavior: rejected due to roadmap/spec delta.
- Affected interfaces and contracts:
  - `ParsedGraph.type` contract and parser acceptance criteria.
  - Lint diagnostic `EXIT_NODE_COUNT` / exit-node invariant semantics.

## Edge Cases
- Edge case 1:
  - `strict digraph` should still parse as valid digraph input.
- Edge case 2:
  - Graphs with zero or multiple exit nodes should both fail with explicit count.
- Failure mode handling:
  - Parser emits structured `DOTParserError`; lint emits deterministic diagnostics.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| PKG020C-INV-01 | Non-`digraph` workflows never enter runtime execution | Parser-level rejection before graph conversion | `parser-wrapper` unit tests for `graph` rejection |
| PKG020C-INV-02 | Workflow termination semantics remain unambiguous with one exit contract | Lint enforces exactly one exit node | Lint unit tests for zero/one/multiple exit counts |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `PKG-020C-01` enforce `digraph`-only parsing
  - `PKG-020C-02` enforce exactly-one-exit lint cardinality
- Implementer scope statement (batch-limited):
  - Implement only `PKG-020C-01` and `PKG-020C-02` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `PKG-020C-01` and `PKG-020C-02` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.

## Deferred to Next Batch / Subagent
- `PKG-020C-03`: `loop_restart` fresh-run boundary semantics.
- `PKG-020C-04`: manager loop Phase C optional local child execution adapter hook.
