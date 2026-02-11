# Plan: RMD-020/021/022 Finalization Batch 1

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-020`, `RMD-021`, `RMD-022`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - Roadmap still lists `RMD-020/021/022` as in progress in several sections.
  - Evidence exists in this checkout (lint/typecheck/tests, parity, PR-body compliance) but is not consolidated into finalization artifacts.
- Target behavior:
  - Produce a bounded finalization batch that: creates plan/review/solution artifacts, records verification evidence, adds a 0.2 core completion report, and updates the roadmap to Done with links.
- Why this change is needed:
  - Close out 0.2.x core items with deterministic, repository-native evidence and lock the ratchet for the batch.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Roadmap status | `ROADMAP.md` | Shows `RMD-020/021/022` as In progress with caveats | Needs Done + links + wording cleanup (no in-progress caveats) |
| Parity script | `scripts/worktree-parity-check.js` | Supports strict/no-skip CI mode; passes locally with HEAD | Capture PASS evidence prior to tracked-file edits |
| PR compliance | `scripts/check-pr-compound-artifacts.js`, `tests/fixtures/pr-body/*.md` | Fixture for pass and expected fail exist | Capture PASS for compliant and FAIL for missing lock |
| Validation commands | `package.json` scripts | Lint/typecheck/test suites stable | Record concise pass summaries |
| Templates | `docs/templates/*.md` | Plan/review/compound templates available | Use as structure for artifacts |

## External Constraints
- Runtime/environment constraints:
  - Worktree parity requires resolvable `HEAD`; run before tracked-file edits for deterministic PASS in this checkout.
- Backward compatibility constraints:
  - No runtime/API changes; docs-only plus evidence capture.

## Design Outline
- Proposed approach:
  - Create plan, review, solution, and completion report docs reusing templates and linking cross-artifacts.
  - Run validations: `lint`, `typecheck`, `test:run`, `test:golden`, `test:worktree`, PR-body compliance (pass + expected fail); embed concise evidence lines.
  - Update `ROADMAP.md` to mark items Done and link artifacts; remove stale in-progress wording without duplicating structure.
- Rejected alternatives and why:
  - Deferring finalization to future PR: rejected; evidence is already available in this checkout.
- Affected interfaces and contracts:
  - None (process documentation only).

## Edge Cases
- Edge case 1:
  - Running worktree parity after modifying tracked files may trigger local SKIP. Mitigation: run parity first.
- Edge case 2:
  - Non-deterministic test timing; record only pass/fail counts, not timings.
- Failure mode handling:
  - If any validation fails, halt batch and reopen; not applicable here (all passes recorded).

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD-FIN-INV-01 | Finalization introduces no runtime behavior changes | Docs-only edits; no src changes | CI/local validation suite remains green |

## Validation Checklist
- [x] Lint passes
- [x] Typecheck passes
- [x] Unit/integration tests pass
- [x] Golden regression passes
- [x] Worktree parity pass (local checkout)
- [x] PR-body compliance: pass for compliant, expected failure for missing lock
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `RMD-020F-01`
  - `RMD-021F-01`
  - `RMD-022F-01`
- Implementer scope statement (batch-limited):
  - Produce finalization artifacts, capture evidence, and update roadmap status for the three items only.
- Verifier scope statement (batch-only):
  - Verify only `RMD-020F-01`, `RMD-021F-01`, `RMD-022F-01` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
