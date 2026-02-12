# Plan: BK-005 Companion Spec Scope Contract + Parity Evidence Declaration (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `BK-005`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - Roadmap states companion spec alignment is partial, but there is no dedicated scope contract explicitly labeling adoption as `implemented`, `partial`, or `out-of-scope` with linked evidence.
  - README wording can still be read as broader conformance claims than what is explicitly evidenced.
- Target behavior:
  - Publish a dedicated companion spec scope contract doc covering coding-agent-loop and unified-llm adoption boundaries.
  - Declare scope per capability using `implemented|partial|out-of-scope` plus test/doc evidence links.
  - Update README/ROADMAP claims language and references to be auditably precise.
- Why this change is needed:
  - `BK-005` is the roadmap closure item for companion-spec scope clarity and auditable parity claims.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Companion alignment status | `ROADMAP.md`, `docs/spec-conformance-matrix.md` | Partial-alignment notes exist; ULLM breadth mapping row is open pending BK-005 | Add explicit scope contract and update delta status where appropriate |
| README claims | `README.md` | Strong Attractor framing; no explicit companion-spec scope contract link | Add scope-language section to avoid ambiguous implementation claims |
| Evidence sources | `packages/core/src/llm/index.test.ts`, `packages/core/src/handlers/codergen.test.ts`, `packages/cli/src/self-host-dogfood.test.ts` | Deterministic evidence exists for adapter boundary/stream/parity and bounded self-host loop | Use as evidence links in scope contract |

## External Constraints
- Runtime/environment constraints:
  - Documentation-only behavior should remain deterministic and source-backed.
- Backward compatibility constraints:
  - No runtime behavior changes in this batch.

## Design Outline
- Proposed approach:
  - Add `docs/companion-spec-scope-contract.md` with:
    - scope statuses definition (`implemented`, `partial`, `out-of-scope`),
    - coding-agent-loop capability mapping with evidence,
    - unified-llm capability mapping with evidence,
    - explicit claim-policy language for README/ROADMAP usage.
  - Update `docs/spec-conformance-matrix.md` to reference scope contract and close `ULLM-DELTA-02`.
  - Update README and ROADMAP wording/links to align claims with published scope contract.
  - Add required plan/review/solution/completion artifacts for `BK-005`.
- Rejected alternatives and why:
  - Keeping only matrix rows without dedicated scope contract: rejected, does not satisfy explicit backlog requirement.
- Affected interfaces and contracts:
  - Documentation contract only (no runtime API change).

## Edge Cases
- Edge case 1:
  - Avoid asserting full companion-spec conformance where evidence only supports bounded/partial adoption.
- Edge case 2:
  - Preserve distinction between scope declaration (`BK-005`) and maturity/promotion gates (`BK-006`).
- Failure mode handling:
  - Any capability without direct evidence is labeled `partial` or `out-of-scope` with explicit rationale.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK005-INV-01 | Companion-spec claims remain auditable and bounded | Every scope row includes evidence links and explicit status | Review artifact verifies selected BK-005 IDs only |
| BK005-INV-02 | No runtime behavior regression | Documentation-only changes | `lint`, `typecheck`, `test:run`, `test:golden` remain green |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK005-01` publish companion spec scope contract (`implemented|partial|out-of-scope`) with evidence links
  - `BK005-02` align conformance matrix/readme wording with scope contract and close ambiguous claim language
  - `BK005-03` roadmap/process artifact convergence and backlog closure
- Implementer scope statement (batch-limited):
  - Implement docs/matrix/roadmap closure only for `BK-005`; defer self-hosting maturity gate design to `BK-006`.
- Verifier scope statement (batch-only):
  - Verify only selected issue IDs with pass/fail evidence; no new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
