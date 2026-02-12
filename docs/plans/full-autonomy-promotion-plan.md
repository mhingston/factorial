# Plan: Full autonomy promotion claim sync

## Metadata
- Date: 2026-02-12
- Author: OpenCode
- Related issue/PR: BK-018 (promotion follow-up)
- Risk level: low

## Requirement / Behavior Delta
- Current behavior: Claim-bearing docs declare current maturity level as `autonomous` with `full-autonomy` as next level.
- Target behavior: Claim-bearing docs consistently declare `full-autonomy` as current maturity level and remove transitional language.
- Why this change is needed: Evidence artifacts for FA-001 through FA-009 and readiness rollup are published; claims need to reflect the achieved level without drift across documents.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Roadmap claims | `ROADMAP.md` | Declares current level `autonomous` and next level `full-autonomy`. | Must align with maturity ladder + companion + matrix. |
| Maturity ladder | `docs/self-hosting-maturity-ladder.md` | Declares current `autonomous` and next `full-autonomy` in two sections. | Update declaration + promotion wording. |
| Conformance matrix | `docs/spec-conformance-matrix.md` | CAL-DELTA-02 mentions explicit current-level claim (`autonomous`) + unattended out-of-scope. | Update claim language to full autonomy. |
| Companion scope | `docs/companion-spec-scope-contract.md` | States “currently claims `autonomous` readiness only”. | Update to `full-autonomy`. |
| Active handoff | `docs/roadmap/active-handoff.md` | Active queue still lists BK-018 full-autonomy gates. | Move to completion if promoted. |
| README | `README.md` | Current maturity level `autonomous` footer note. | Update to `full-autonomy`. |

## External Constraints
- API/provider constraints: None (docs-only).
- Runtime/environment constraints: Claims-consistency audit must pass.
- Backward compatibility constraints: None (no runtime behavior changes).

## Design Outline
- Proposed approach:
  - Update claim-bearing docs to declare `full-autonomy` as current level.
  - Adjust “next level” to `none` (or remove) consistently across roadmap + maturity ladder.
  - Remove transitional wording about “promotion criteria for full-autonomy”.
  - Move BK-018 out of active queue in handoff if promotion is finalized.
- Rejected alternatives and why:
  - Keeping `autonomous` as current while evidence says full-autonomy: fails claims-consistency intent.
  - Partial updates: would break `npm run claims:audit` and CI gating.
- Affected interfaces and contracts:
  - Claims-consistency audit inputs: `ROADMAP.md`, `docs/spec-conformance-matrix.md`, `docs/companion-spec-scope-contract.md`, `docs/self-hosting-maturity-ladder.md`, `docs/roadmap/active-handoff.md`.

## Edge Cases
- Edge case 1: Claims-consistency audit requires synchronized current/next levels across documents.
- Edge case 2: Companion unattended autonomy scope rules change when next level is `full-autonomy` (CLM-005 rules).
- Failure mode handling: If claims audit fails, revert to unified values before re-running.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
N/A — documentation and claim alignment only.

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: OP-FA-PROMO-001 (claim sync)
- Implementer scope statement (batch-limited): Update claim-bearing docs and handoff queue to reflect `full-autonomy` promotion; no runtime behavior changes.
- Verifier scope statement (batch-only): Validate claim consistency across updated docs; no new critique beyond claim sync.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
