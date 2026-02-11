# Plan: RMD-021 Worktree Parity Batch 1

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-021`
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - Worktree parity script is implemented and CI wired.
  - Local check in this checkout skips because `HEAD` is not resolvable.
  - CI step does not explicitly fail if a skip condition ever occurs unexpectedly.
- Target behavior:
  - CI enforces strict `HEAD` requirement for worktree parity checks.
  - README documents the local skip caveat clearly.
  - Roadmap/process artifacts capture current verification evidence and constraints.
- Why this change is needed:
  - `RMD-021` requires deterministic parity guarantees; silent skip paths must be explicit and controlled.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| parity script | `scripts/worktree-parity-check.js` | skips with exit 0 when `HEAD` is not resolvable | add strict mode via env flag for CI |
| CI wiring | `.github/workflows/ci.yml` | runs `npm run test:worktree` without strict skip enforcement | set strict env in worktree job |
| docs | `README.md`, `ROADMAP.md`, `docs/roadmap/0.2-prioritized-issues.md` | worktree support documented, but local no-HEAD caveat not explicit | add caveat + status evidence links |

## External Constraints
- API/provider constraints:
  - none.
- Runtime/environment constraints:
  - worktree parity requires checkout with resolvable `HEAD` commit.
- Backward compatibility constraints:
  - local dev flow should keep non-strict skip behavior by default.

## Design Outline
- Proposed approach:
  - Add `WORKTREE_PARITY_REQUIRE_HEAD=1` strict mode in parity script.
  - Enable strict mode in CI `worktree-parity` job.
  - Document no-HEAD local skip behavior in README.
  - Update roadmap status evidence for `RMD-021`.
- Rejected alternatives and why:
  - Making no-HEAD always fail locally: rejected to preserve usability in pre-commit sandbox checkouts.
  - Removing skip support entirely: rejected because checkouts without commit history exist in local/dev workflows.
- Affected interfaces and contracts:
  - `scripts/worktree-parity-check.js` environment contract (`WORKTREE_PARITY_REQUIRE_HEAD`).

## Edge Cases
- Edge case 1:
  - Local checkout with no commit history should skip with explicit message.
- Edge case 2:
  - CI with strict mode should fail if no-HEAD condition occurs unexpectedly.
- Failure mode handling:
  - Strict mode exits non-zero on no-HEAD and surfaces actionable stderr.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD021-INV-01 | CI never treats no-HEAD skip as parity success | strict mode env in CI parity job | CI config + local script behavior verification |
| RMD021-INV-02 | Local developer check remains deterministic and explicit | default non-strict skip with explicit message | `npm run test:worktree` output evidence |

## Validation Checklist
- [x] Unit/integration tests updated (N/A: script/CI wiring change validated via command-level checks)
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `RMD-021A` strict CI no-skip enforcement for worktree parity
  - `RMD-021B` docs/roadmap caveat and status evidence alignment
- Implementer scope statement (batch-limited):
  - Implement only `RMD-021A` and `RMD-021B` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `RMD-021A` and `RMD-021B` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
