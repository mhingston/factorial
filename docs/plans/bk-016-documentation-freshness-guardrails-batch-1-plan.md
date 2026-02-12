# Plan: BK-016 Documentation Freshness Guardrails (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-016`
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - Claim consistency is fail-closed for a bounded set of docs, but repository-wide command-surface and backlog-direction drift is not automatically enforced.
  - `AGENTS.md` and `README.md` can diverge on executable command references without a deterministic gate.
  - `ROADMAP.md` freshness and `AGENTS.md` backlog-direction declarations are policy text rather than enforced contracts.
- Target behavior:
  - Add deterministic docs freshness audit command publishing `docs_freshness_report.v1`.
  - Validate required docs readability/parseability (`README.md`, `AGENTS.md`, `ROADMAP.md`, `package.json`).
  - Enforce AGENTS `Core Commands` parity against `package.json` scripts and README command examples.
  - Enforce roadmap freshness SLA from `Last updated: YYYY-MM-DD`.
  - Enforce backlog-direction consistency between AGENTS declaration and ROADMAP `### Next` queue.
  - Add fail-closed CI lane and fixture-backed regression coverage.
- Why this change is needed:
  - `BK-016` requires deterministic, auditable documentation freshness so operating guidance cannot silently drift from executable behavior.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Existing fail-closed claim gate | `scripts/claims-consistency-audit.js`, `packages/cli/src/claims-consistency-audit.test.ts` | Deterministic contract/report pattern + fixture pass/fail tests | Reuse same style for docs freshness |
| PR-process contract gate | `scripts/check-pr-compound-artifacts.js` | Enforces PR metadata fields but not doc drift | Keep unchanged; additive docs gate |
| CI validation lanes | `.github/workflows/ci.yml` | Dedicated jobs for claims/reliability/telemetry gates | Add docs-freshness lane with artifact upload |
| Source-of-truth guidance docs | `AGENTS.md`, `README.md`, `ROADMAP.md`, `package.json` | Existing command lists and backlog direction exist but not fully synchronized by automation | Must converge and enforce |

## External Constraints
- API/provider constraints:
  - None; gate must be repo-local and deterministic.
- Runtime/environment constraints:
  - No network access required; script must parse plain text and JSON deterministically.
- Backward compatibility constraints:
  - Additive only; no runtime graph-engine behavior changes.

## Design Outline
- Proposed approach:
  - Add `scripts/docs-freshness-audit.js` with explicit checks `DF-001..DF-004` and `docs_freshness_report.v1` output.
  - Add npm command `docs:freshness`.
  - Add tests in `packages/cli/src/docs-freshness-audit.test.ts` using fixtures for compliant pass + drift/freshness fail paths.
  - Add CI job in `.github/workflows/ci.yml` running the new gate and uploading report artifact.
  - Update `README.md`, `AGENTS.md`, and `ROADMAP.md` to include gate usage and BK-016 completion references.
- Rejected alternatives and why:
  - Lint-only markdown rules: rejected because they do not validate semantic command/backlog parity across docs.
  - Manual checklist enforcement: rejected because BK-016 requires fail-closed deterministic behavior.
- Affected interfaces and contracts:
  - New command: `npm run docs:freshness`.
  - New report schema: `docs_freshness_report.v1`.
  - New CI lane: `docs-freshness`.

## Edge Cases
- Edge case 1:
  - AGENTS lists commands not present in package scripts or missing in README examples.
- Edge case 2:
  - ROADMAP `Last updated` missing/invalid/stale/future-dated.
- Failure mode handling:
  - Report still publishes with failed check IDs and command exits non-zero.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK016-INV-01 | Documentation contracts fail closed on drift | Deterministic `DF-*` checks with non-zero exit on failure | regression tests for fail paths |
| BK016-INV-02 | AGENTS commands stay executable and documented | Compare AGENTS core command script IDs against `package.json` and README command surface | command-drift fixture test |
| BK016-INV-03 | Roadmap freshness remains explicit and bounded | Parse `Last updated` and enforce max-age SLA | stale-roadmap fixture test |
| BK016-INV-04 | Backlog direction is synchronized across source docs | Parse AGENTS backlog direction and ROADMAP `### Next` BK IDs | gate output + local command pass |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK016-01` Add deterministic docs freshness report contract and fail-closed script checks.
  - `BK016-02` Add fixture-backed tests for compliant pass, command drift fail, and roadmap freshness fail.
  - `BK016-03` Add CI docs-freshness lane with report artifact upload.
  - `BK016-04` Converge AGENTS/README/ROADMAP and publish completion artifacts.
- Implementer scope statement (batch-limited):
  - Implement only `BK016-01` through `BK016-04`.
- Verifier scope statement (batch-only):
  - Verify only `BK016-01` through `BK016-04` with pass/fail evidence; do not introduce new issue IDs.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
