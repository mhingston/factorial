# Review: PKG-020C Spec Conformance Batch 1

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `PKG-020C` batch 1 (`PKG-020C-01`, `PKG-020C-02`)
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `PKG-020C-01` | correctness | P1 | high | in-batch | `packages/dot-parser/src/dot.pegjs:199` | DOT grammar accepted `graph` mode; roadmap requires `digraph`-only parsing for Attractor conformance. |
| `PKG-020C-02` | correctness | P1 | high | in-batch | `packages/core/src/lint/index.ts:99` | Lint accepted multiple exit nodes (`at least one`) instead of enforcing exactly one exit node. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `PKG-020C-01`, `PKG-020C-02`
- Deferred issue IDs: `PKG-020C-03`, `PKG-020C-04`
- Batch rationale:
  - This batch closes parser/lint spec conformance first with low risk and deterministic verification.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `PKG-020C-01` | pass | `packages/dot-parser/src/dot.pegjs`, regenerated `packages/dot-parser/src/parser.js`, and `packages/dot-parser/src/parser-wrapper.test.ts` now reject `graph` mode and accept `strict digraph`; validated by `npm run test:run -- packages/dot-parser/src/parser-wrapper.test.ts`. | none |
| `PKG-020C-02` | pass | `packages/core/src/lint/index.ts` now enforces exact exit cardinality and `packages/core/src/lint/index.test.ts` includes multiple-exit regression; validated by `npm run test:run -- packages/core/src/lint/index.test.ts`. | none |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any): none
- Lock rationale:
  - Selected batch issues are implemented and verified by targeted and full validation (`npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run test:golden`).

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/pkg-020c-spec-conformance-batch-1-plan.md`](../plans/pkg-020c-spec-conformance-batch-1-plan.md)
- Roadmap: [`ROADMAP.md`](../../ROADMAP.md)
