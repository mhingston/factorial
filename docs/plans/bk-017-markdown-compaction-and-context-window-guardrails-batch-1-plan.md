# Plan: BK-017 Markdown Compaction and Context-Window Guardrails (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-017`
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - Docs freshness checks cover command/backlog drift and roadmap freshness, but do not constrain markdown growth directly.
  - `ROADMAP.md` can accumulate historical sections over time and become a large prompt payload.
  - No enforced requirement exists for a compact active handoff doc or archive index references.
- Target behavior:
  - Extend `docs:freshness` with markdown line-count budgets and fail-closed checks.
  - Require compact handoff/archive assets and explicit references from source-of-truth docs.
  - Compact `ROADMAP.md` by moving heavy historical artifact listing into archive docs.
  - Keep roadmap execution context concise while preserving full history in archived markdown.
- Why this change is needed:
  - Without size/compaction guardrails, long-lived markdown docs will continue growing and eventually degrade coding-agent context quality and review throughput.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Existing docs freshness gate | `scripts/docs-freshness-audit.js`, `packages/cli/src/docs-freshness-audit.test.ts` | Validates command parity, roadmap freshness, backlog direction | Extend with size budgets + compaction assets |
| Source-of-truth policy docs | `ROADMAP.md`, `AGENTS.md`, `README.md` | No hard compaction policy or archive/handoff contract | Add explicit references and compact layout |
| Archive target | `docs/roadmap/` | No dedicated archive index/active handoff contract | Add `docs/roadmap/archive/README.md` + `docs/roadmap/active-handoff.md` |

## External Constraints
- API/provider constraints:
  - None; must be repository-local.
- Runtime/environment constraints:
  - Deterministic, network-independent checks only.
- Backward compatibility constraints:
  - No changes to runtime engine behavior; doc/process-only + guardrail script/test updates.

## Design Outline
- Proposed approach:
  - Add `DF-005` size-budget check (`README.md`, `AGENTS.md`, `ROADMAP.md`, `docs/roadmap/active-handoff.md`).
  - Add `DF-006` compaction-asset check (handoff + archive index readability and references from `ROADMAP.md`/`AGENTS.md`).
  - Add new script args for line budgets and compaction paths.
  - Extend regression tests with budget-fail and missing-asset fail cases.
  - Create archive docs and compact roadmap inline artifact listing.
  - Publish BK-017 completion/process artifacts.
- Rejected alternatives and why:
  - Manual compaction-only policy: rejected; does not fail closed.
  - Token-count estimation as gate threshold: rejected for determinism/maintainability; line budgets are simpler and stable.
- Affected interfaces and contracts:
  - Existing command: `npm run docs:freshness` (extended checks, additive flags).
  - Existing report schema: `docs_freshness_report.v1` (extended policy/check details).

## Edge Cases
- Edge case 1:
  - Docs are readable but compaction references are missing.
- Edge case 2:
  - Line budgets are exceeded while semantic checks still pass.
- Failure mode handling:
  - Report publishes failed check IDs (`DF-005`/`DF-006`) and command exits non-zero.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK017-INV-01 | Markdown growth stays bounded | Size-budget check with explicit max-line policy fields | `DF-005` regression + local pass run |
| BK017-INV-02 | Compaction assets remain first-class and discoverable | Required handoff/archive docs + source-doc references | `DF-006` regression + local pass run |
| BK017-INV-03 | Historical detail is retained while roadmap remains compact | Move heavy execution-artifact listing to archive file and link from roadmap | archive file + roadmap compaction references |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK017-01` Extend docs freshness script with markdown size-budget checks and compaction-asset checks.
  - `BK017-02` Add regression tests/fixtures for new fail scenarios.
  - `BK017-03` Add archive/handoff docs and compact roadmap inline artifact listing.
  - `BK017-04` Converge AGENTS/README/ROADMAP references and publish completion artifacts.
- Implementer scope statement (batch-limited):
  - Implement only `BK017-01` through `BK017-04`.
- Verifier scope statement (batch-only):
  - Verify only `BK017-01` through `BK017-04` with pass/fail evidence; do not introduce new issue IDs.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
