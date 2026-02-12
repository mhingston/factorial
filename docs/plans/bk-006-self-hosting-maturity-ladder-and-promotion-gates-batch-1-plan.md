# Plan: BK-006 Self-hosting Maturity Ladder and Promotion Gates (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `BK-006`
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - Repository validates bounded deterministic self-host behavior (`npm run dogfood:self-host`) but lacks a formal staged maturity ladder with objective promotion gates.
  - No single CI/reporting hook evaluates current self-host maturity state and emits an auditable report contract.
- Target behavior:
  - Define and adopt staged levels: `deterministic-local`, `provider-backed`, `autonomous`.
  - Implement objective gates with deterministic pass/fail/pending evaluation and report artifacts.
  - Enforce current-level requirements in CI and declare required criteria for next level promotion.
- Why this change is needed:
  - `BK-006` is the remaining roadmap backlog item for self-hosting maturity closure and promotion-gate readiness.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Deterministic self-host evidence | `scripts/self-host-dogfood.js`, `packages/cli/src/self-host-dogfood.test.ts` | Confirms `resolved` pass + `reopen` fail lock enforcement | Reuse as `deterministic-local` gate signal |
| Promotion/profile governance | `packages/core/src/lint/index.ts`, `tests/golden/workflows/promotion-regulated.dot` | Governance overlays implemented and tested | Use objective validate checks in maturity gate runner |
| CI policy hooks | `.github/workflows/ci.yml` | Existing lint/typecheck/test/golden/worktree jobs; no self-host maturity gate | Add dedicated maturity job with report artifacts |
| Spec claims tracking | `docs/spec-conformance-matrix.md`, `docs/companion-spec-scope-contract.md`, `ROADMAP.md` | `CAL-DELTA-02` open pending BK-006 | Close with maturity ladder + gate evidence and explicit level declaration |

## External Constraints
- Runtime/environment constraints:
  - CI and local checks must stay deterministic and avoid requiring external provider credentials for current-level enforcement.
- Backward compatibility constraints:
  - No changes to runtime graph semantics; only additive policy/report tooling and documentation convergence.

## Design Outline
- Proposed approach:
  - Add `scripts/self-host-maturity.js` to evaluate gate IDs (`DL-*`, `PB-*`, `AU-*`) and write:
    - JSON report schema: `self_host_maturity_report.v1`
    - Markdown report summary.
  - Add npm script `self-host:maturity` and CI job that enforces `--require-level deterministic-local` and uploads report artifacts.
  - Add regression test for maturity script contract.
  - Publish `docs/self-hosting-maturity-ladder.md` declaring levels, gates, current level, and next-level criteria.
  - Update README/spec-matrix/roadmap/AGENTS to converge on the same maturity contract and close `BK-006`.
- Rejected alternatives and why:
  - Documentation-only ladder without executable gate evaluation: rejected, not auditable and does not satisfy CI/reporting hook requirement.
- Affected interfaces and contracts:
  - Additive script contract (`self_host_maturity_report.v1`) and CI policy hook only.

## Edge Cases
- Edge case 1:
  - Promotion gates for higher levels should be objective but may remain `pending` when required evidence artifacts are intentionally unpublished.
- Edge case 2:
  - Avoid recursive command execution in maturity gate evaluation (e.g., invoking broad test/audit flows from within tests).
- Failure mode handling:
  - `--require-level` exits non-zero when required level is not eligible; report still written for diagnosis.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK006-INV-01 | Current maturity claim remains evidence-backed and machine-checkable | `self-host:maturity` computes level eligibility from objective gate results and emits structured report | Verify `required_level_met=true` for `deterministic-local` in report + CI job |
| BK006-INV-02 | Existing lock/promotion governance controls are not weakened | Maturity gates assert dogfood lock behavior and promotion/profile validation outcomes | Gate checks `DL-001` + `DL-002` + `DL-003` pass |
| BK006-INV-03 | No runtime behavior regression | Additive scripts/docs/CI only | `lint`, `typecheck`, `test:run`, `test:golden` remain green |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK006-01` Add self-host maturity gate runner + report contract with staged level evaluation
  - `BK006-02` Add CI/reporting hook enforcing `deterministic-local` requirement
  - `BK006-03` Publish self-hosting maturity ladder doc with current level and next-level criteria
  - `BK006-04` Converge roadmap/spec/README/AGENTS claims and close BK-006 artifacts
- Implementer scope statement (batch-limited):
  - Implement only BK-006 maturity ladder, gate tooling, CI hook, and associated docs/artifacts.
- Verifier scope statement (batch-only):
  - Verify only `BK006-01`..`BK006-04` with pass/fail evidence; do not introduce new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
