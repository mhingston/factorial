# Plan: RMD-022 Compound Enforcement Batch 1

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-022` (`PKG-022A`)
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - PR template contains compound checklist fields.
  - CI does not enforce artifact-link/lock-decision requirements from PR body.
  - Weekly metrics cadence is documented but no reproducible report generator or 4-week report set is present.
- Target behavior:
  - CI fails PRs missing required plan/review/compound artifacts and consensus lock decision.
  - Repository includes a reproducible weekly report generator and four consecutive weekly reports under `docs/metrics/reports/`.
  - Contributor-facing checks keep ratchet rule explicit.
- Why this change is needed:
  - `RMD-022` requires converting process guidance into enforceable policy with measurable compliance.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| PR ergonomics | `.github/pull_request_template.md` | contains checklist and artifact placeholders | add explicit lock-decision field for machine validation |
| CI workflows | `.github/workflows/ci.yml` | no PR-body artifact enforcement step | add dedicated PR compliance job |
| enforcement scripts | `scripts/` | no PR artifact checker or metrics report generator | add `check-pr-compound-artifacts.js` and `compound-weekly-report.js` |
| metrics docs | `docs/metrics/compound-rate.md` | formulas and template only | add routine command + links to 4 weekly reports |

## External Constraints
- API/provider constraints:
  - CI check should use GitHub event payload body via env variable (no external API call required).
- Runtime/environment constraints:
  - Metrics generator must run from git history/repo artifacts only.
- Backward compatibility constraints:
  - Existing PR template semantics should remain familiar.

## Design Outline
- Proposed approach:
  - Add PR-body checker script with strict pass/fail for plan/review/compound links and lock decision.
  - Add CI `pr-compound-compliance` job on `pull_request` using `PR_BODY` env.
  - Add weekly metrics report generator script and generate four weekly reports.
  - Update metrics doc and roadmap links.
- Rejected alternatives and why:
  - Relying only on PR template checklist: rejected (not enforceable).
  - Manual weekly reporting only: rejected (non-reproducible).
- Affected interfaces and contracts:
  - PR body contract fields in `.github/pull_request_template.md`.
  - script env contract: `PR_BODY` for compliance checker.

## Edge Cases
- Edge case 1:
  - PR body missing or empty should fail in CI with actionable errors.
- Edge case 2:
  - Compound artifact may be `N/A` only with explicit reason text.
- Failure mode handling:
  - checker script exits non-zero with missing-field list.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD022-INV-01 | PRs cannot merge without compound artifact evidence and consensus lock decision | CI PR-body compliance job + checker script | simulate local checker inputs and run CI lint/test suite |
| RMD022-INV-02 | Weekly metrics reports are reproducible from repo artifacts | generator script with deterministic inputs (week range + git history) | generate 4 consecutive weekly reports under docs |

## Validation Checklist
- [x] Unit/integration tests updated (script-level fixture checks for compliant/non-compliant PR bodies)
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `RMD-022A` PR artifact-link + lock decision CI gate
  - `RMD-022B` weekly metrics generator + 4-week report artifacts
- Implementer scope statement (batch-limited):
  - Implement only `RMD-022A` and `RMD-022B` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `RMD-022A` and `RMD-022B` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
