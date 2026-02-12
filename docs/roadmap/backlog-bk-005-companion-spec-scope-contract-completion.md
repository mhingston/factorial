# Backlog BK-005 Companion Spec Scope Contract Completion

Last updated: 2026-02-11

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-005` (Companion spec scope contract + parity evidence declaration)

## Implemented Capabilities
1. Companion-spec scope contract publication
- Added `docs/companion-spec-scope-contract.md` covering coding-agent-loop and unified-llm adoption boundaries.
- Declares capability-level statuses using:
  - `implemented`
  - `partial`
  - `out-of-scope`
- Links each declaration to deterministic test/doc evidence.

2. Conformance matrix and claims-language convergence
- Updated `docs/spec-conformance-matrix.md` to close `ULLM-DELTA-02` with scope-contract evidence.
- Updated README and ROADMAP wording/links so companion-spec claims are explicit and auditable.

3. Roadmap execution progression
- Marked `BK-005` as done.
- Advanced execution focus to `BK-006` (self-hosting maturity ladder and promotion gates).

## Validation Evidence
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-005-companion-spec-scope-contract-batch-1-plan.md`](../plans/bk-005-companion-spec-scope-contract-batch-1-plan.md)
- Review: [`docs/reviews/bk-005-companion-spec-scope-contract-batch-1-review.md`](../reviews/bk-005-companion-spec-scope-contract-batch-1-review.md)
- Solution: [`docs/solutions/companion-spec-scope-contract-and-claims-policy.md`](../solutions/companion-spec-scope-contract-and-claims-policy.md)

## Exit Criteria
- Explicit scope doc exists for coding-agent-loop and unified-llm with `implemented|partial|out-of-scope` declarations and evidence links.
- README/ROADMAP implementation claims are auditable and non-ambiguous.
