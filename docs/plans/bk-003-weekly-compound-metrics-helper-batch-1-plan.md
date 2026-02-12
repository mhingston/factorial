# Plan: BK-003 Weekly Compound Metrics Helper Command (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `BK-003`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - A repository script (`scripts/compound-weekly-report.js`) can generate weekly reports, but there is no first-class CLI helper command in `factorial` for this workflow.
  - Script output is markdown-only.
- Target behavior:
  - Add a CLI helper command that generates standardized weekly compound metrics from repository artifacts.
  - Support both markdown report output and optional machine-readable JSON output for automation.
- Why this change is needed:
  - `BK-003` explicitly calls for an optional helper command; surfacing this in CLI closes the backlog item and makes the workflow discoverable and test-covered.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Existing weekly helper | `scripts/compound-weekly-report.js` | Generates markdown report from git/review artifacts | Logic can be mirrored for CLI helper command |
| CLI surface | `packages/cli/src/index.ts` | Provides utility commands (`manifest`, `dtu-run`, `confidence-tune`) | Natural location for optional helper command |
| CLI regression tests | `packages/cli/src/e2e-smoke.test.ts` | Covers command-level contracts end-to-end | Add command regression assertions |
| Metrics docs | `README.md`, `docs/metrics/compound-rate.md` | Weekly reporting documented mostly via npm script | Add CLI command usage |

## External Constraints
- Runtime/environment constraints:
  - Must be deterministic and CI-friendly.
  - Must work from repository artifacts and git history with no network calls.
- Backward compatibility constraints:
  - Additive CLI command only; existing script remains intact.

## Design Outline
- Proposed approach:
  - Add CLI command: `factorial compound-weekly --start YYYY-MM-DD [--end YYYY-MM-DD] [--output <path>] [--json]`.
  - Reuse existing metrics semantics:
    - solutions created,
    - context updates,
    - issue class recurrence,
    - reopen rate,
    - review artifacts counted.
  - Write markdown report by default and emit JSON to stdout when `--json` is set.
  - Add deterministic e2e smoke test with a fixed historical window and output assertions.
  - Update roadmap/docs and create review/solution/completion artifacts.
- Rejected alternatives and why:
  - Replacing existing script only: rejected to avoid breaking existing usage.
  - Auto-detecting “current week” without explicit date input: rejected for deterministic CI behavior.
- Affected interfaces and contracts:
  - New CLI command surface; existing script and report format preserved.

## Edge Cases
- Edge case 1:
  - Missing `--start` should fail with explicit error.
- Edge case 2:
  - No matching git/review artifacts in the interval should still produce a valid deterministic report with `N/A` rates as needed.
- Failure mode handling:
  - Non-zero exit on invalid date/input parsing.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK003-INV-01 | Weekly report generation remains deterministic for fixed inputs | Stable sorting and explicit date-window inputs | CLI e2e test validates deterministic command/report contract |
| BK003-INV-02 | Existing weekly-report script behavior is not regressed | Additive CLI command only; no removal of script path | Existing tests + lint/typecheck/test suite remain green |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK003-01` CLI weekly helper command and deterministic output contract
  - `BK003-02` JSON output mode for automation compatibility
  - `BK003-03` docs/roadmap/process artifact convergence
- Implementer scope statement (batch-limited):
  - Implement CLI helper, tests, and documentation/artifacts only for `BK-003`.
- Verifier scope statement (batch-only):
  - Verify selected issue IDs only with pass/fail evidence and no new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
