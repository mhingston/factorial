# Plan: BK-013 Claims-Consistency Guardrails Across Roadmap/Spec/Maturity Docs (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-013`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - Claims are declared across `ROADMAP.md`, `docs/spec-conformance-matrix.md`, `docs/companion-spec-scope-contract.md`, and `docs/self-hosting-maturity-ladder.md` but there is no deterministic consistency audit command.
  - CI has no fail-closed gate for contradictory claims across these documents.
  - Real drift already exists: companion scope claims current readiness as `deterministic-local` while roadmap/maturity currently declare `provider-backed`.
- Target behavior:
  - Add deterministic claims-audit command that validates cross-document consistency for:
    - declared maturity level + next-level target,
    - selected open/closed conformance delta states,
    - companion-scope autonomy wording boundaries.
  - Add fixtures and regression tests proving compliant-pass and mismatch-fail outcomes.
  - Add CI fail-closed claims-consistency job and artifact upload.
  - Converge roadmap/spec/companion/maturity declarations to satisfy the new guardrail.
- Why this change is needed:
  - `BK-013` is the active backlog head and explicitly requires pre-merge blocking of contradictory declarations in source-of-truth claim documents.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| BK-013 scope definition | `ROADMAP.md` | Defines required deterministic claims-audit command, CI fail-closed gate, and fixtures for pass/fail behavior | Provides direct implementation criteria (`BK-013` section) |
| Maturity declarations | `docs/self-hosting-maturity-ladder.md` | Declares current level `provider-backed` and next level `autonomous` | Should be one source input for consistency checks |
| Companion scope claims | `docs/companion-spec-scope-contract.md` | Includes autonomy claims wording, but currently states current readiness as `deterministic-local` | Must be reconciled and guarded |
| Delta status declarations | `docs/spec-conformance-matrix.md` | Declares delta statuses (`CAL-DELTA-02`, `ULLM-DELTA-02`) and claim wording | Must stay synchronized with roadmap/companion assertions |
| Existing CI gate style | `.github/workflows/ci.yml` | Contains dedicated fail-closed jobs for maturity/flake/reliability gates with artifact upload | Reuse this pattern for claims-consistency |
| Existing deterministic policy scripts | `scripts/check-pr-compound-artifacts.js` | Deterministic parser + explicit failure list + non-zero exit | Reuse script pattern for claims audit |

## External Constraints
- API/provider constraints:
  - No external network/provider calls allowed for this audit; all checks must be repository-local.
- Runtime/environment constraints:
  - Keep command deterministic and CI-friendly, with explicit pass/fail and structured report output.
- Backward compatibility constraints:
  - Must not weaken existing deterministic-local CI floor or existing self-host maturity/reporting commands.

## Design Outline
- Proposed approach:
  - Add `scripts/claims-consistency-audit.js` with:
    - CLI args for `--roadmap`, `--matrix`, `--companion`, `--maturity`, `--report`, `--json`,
    - deterministic report schema (`claims_consistency_report.v1`),
    - explicit checks for:
      - current/next maturity level consistency across roadmap + maturity + companion wording,
      - targeted delta status consistency between roadmap anchors and spec matrix (`CAL-DELTA-02`, `ULLM-DELTA-02`),
      - companion autonomy boundary wording consistency (`out-of-scope` unattended autonomy).
  - Add machine-parseable claims anchor block in `ROADMAP.md` for deterministic audit extraction.
  - Update companion wording to reflect the declared current level (`provider-backed`) and keep unattended external autonomy out-of-scope language explicit.
  - Add fixtures under `tests/fixtures/claims-audit/` for compliant and mismatch scenarios.
  - Add regression tests in `packages/cli/src/claims-consistency-audit.test.ts` for pass/fail fixture verification.
  - Add npm script command (e.g. `claims:audit`) and CI job in `.github/workflows/ci.yml`.
  - Update docs/roadmap process artifacts for BK-013 closure.
- Rejected alternatives and why:
  - Relying on ad-hoc text scans in CI without a dedicated script: rejected because failures would be brittle and hard to reproduce locally.
  - Checking only one document as source of truth: rejected because BK-013 explicitly requires cross-document synchronization.
- Affected interfaces and contracts:
  - New deterministic command: `npm run claims:audit`.
  - New report schema: `claims_consistency_report.v1`.
  - CI adds fail-closed claims-consistency gate.

## Edge Cases
- Edge case 1:
  - One or more required documents are missing or unreadable.
- Edge case 2:
  - Documents exist but expected anchors/rows are malformed or renamed.
- Failure mode handling:
  - Audit report records explicit failed check IDs with details and exits non-zero.
  - CI fails closed when report generation or validation fails.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK013-INV-01 | Declared current/next maturity claims are synchronized across claim source docs | Deterministic parser checks roadmap anchors + maturity declarations + companion claim wording | claims-audit fixtures/tests + `npm run claims:audit` |
| BK013-INV-02 | Delta closure status for claim-critical deltas does not drift silently | Audit enforces targeted status matches for `CAL-DELTA-02` and `ULLM-DELTA-02` | mismatch fixture asserts fail on status drift |
| BK013-INV-03 | Unattended autonomy boundary remains explicitly out-of-scope | Audit enforces companion out-of-scope autonomy wording and corresponding roadmap/spec claims | pass/fail fixtures + CI gate |
| BK013-INV-04 | Claims audit remains deterministic and CI-friendly | Local-file-only checks + structured report + fail-closed exit code | CI `claims-consistency` job |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK013-01` Add deterministic cross-document claims-audit command/report (`claims_consistency_report.v1`) for roadmap/spec/companion/maturity consistency.
  - `BK013-02` Add compliant-pass and mismatch-fail fixtures/tests for claims-audit behavior.
  - `BK013-03` Add CI fail-closed claims-consistency gate with artifact upload and npm script wiring.
  - `BK013-04` Converge claim-bearing docs and roadmap/process artifacts for BK-013 closeout.
- Implementer scope statement (batch-limited):
  - Implement only `BK013-01` through `BK013-04`.
- Verifier scope statement (batch-only):
  - Verify only `BK013-01` through `BK013-04` with pass/fail evidence; do not introduce new issue IDs.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
