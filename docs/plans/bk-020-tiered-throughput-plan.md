# Plan: Tiered Throughput Philosophy and Fast-Track CI Gates

## Metadata
- Date: 2026-02-13
- Author: Factorial Engineering Team
- Related issue/PR: BK-020
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior: All PRs (regardless of size or risk) must pass the full CI gate matrix (12+ jobs, ~90-100 minutes total runtime). This includes: lint, typecheck, test:run (Node 20+22), DTU scenario harness, coverage gate, golden regression, self-host maturity (deterministic-local), claims consistency, docs freshness, self-host flake replay, release hardening, reliability SLO, unattended telemetry, worktree parity, and evidence freshness checks.
- Target behavior: Implement a tiered CI lane system that routes PRs to appropriate verification depth based on automated risk assessment. Fast-track PRs (<50 lines, low-risk, 100% coverage) skip heavy gates while maintaining safety through mandatory light gates. Standard-track PRs continue with full verification. Emergency-fix track provides rapid deployment with tracking and rollback capability.
- Why this change is needed: Current velocity bottleneck is "death by a thousand gates" for trivial changes. Learning from OpenAI: "corrections are cheap, waiting is expensive"—they achieve 3.5 PRs/engineer/day. Factorial needs to balance reliability culture with engineering throughput. Low-risk changes should not pay the tax of heavy gates designed for high-risk surface changes.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| CI Workflow | `.github/workflows/ci.yml` | 12 jobs: verify (Node 20+22), pr-compound-compliance, golden-regression, self-host-maturity, claims-consistency, docs-freshness, self-host-flake, release-hardening, reliability-slo, self-host-unattended-telemetry, worktree-parity, evidence-freshness | Total runtime: ~90-100 mins. No conditional skipping based on change size/risk. All gates required for merge. |
| PR Validation | `scripts/check-pr-compound-artifacts.js` | Validates plan/review/compound links, lock decision, ratchet reference in PR body | Called by pr-compound-compliance job. Could be extended to read tier metadata. |
| Test Structure | `package.json` scripts, `tests/` directory | test:run (vitest), test:golden (golden regression), dtu:run (scenario harness), test:coverage (coverage gate) | Coverage threshold enforcement in place. Fast-track requires 100% coverage on changed lines. |
| Coverage | `vitest.config.ts` (or similar) | Coverage enforcement via test:coverage script | Fast-track must maintain or improve coverage; coverage gate can be simplified for fast-track. |
| Risk Labels | N/A | No automated risk classification | New: Add PR label detection and plan.md metadata parsing for tier selection. |

## External Constraints
- API/provider constraints: N/A (internal CI changes only)
- Runtime/environment constraints: Must work within GitHub Actions (ubuntu-latest, Node 20/22). Tier selection must be deterministic and auditable.
- Backward compatibility constraints: Existing full-gate workflow must remain as default for backwards compatibility. No PRs should lose existing protections unless explicitly opting into fast-track with proper safeguards.

## Design Outline
- Proposed approach: Implement three-tier CI lane system with automated risk classification:

  1. **Fast-Track Lane** (`tier:fast`):
     - Trigger: PR diff <50 lines, no security-critical files touched, 100% coverage on changed code, passes automated risk classifier
     - Required gates: lint, typecheck, test:run (Node 20 only), coverage check on changed files, worktree parity
     - Skipped gates: DTU scenario harness, golden regression, self-host maturity, claims consistency, docs freshness, self-host flake, release hardening, reliability SLO, unattended telemetry, evidence freshness
     - Estimated runtime: ~8-12 minutes

  2. **Standard-Track Lane** (`tier:standard`):
     - Trigger: Default for all PRs; medium/high-risk changes; >50 lines; any changes to security-critical paths
     - Required gates: Full existing matrix (all 12+ jobs)
     - Estimated runtime: ~90-100 minutes

  3. **Emergency-Fix Lane** (`tier:emergency`):
     - Trigger: Branch name pattern `hotfix/*` or `emergency/*`; manual PR label `emergency-fix`; explicit plan.md declaration
     - Required gates: lint, typecheck, test:run (Node 20 only), security-scan (new minimal gate)
     - Auto-merge enabled with tracking: Creates tracking issue automatically, requires post-merge review within 24h
     - Revert window: 2-hour revert-on-failure policy; automated monitoring with rollback capability
     - Estimated runtime: ~5-8 minutes

  **Risk Classification Mechanism:**
  - Primary: `plan.md` metadata field `ci_tier: fast|standard|emergency`
  - Secondary: PR labels (`tier:fast`, `tier:emergency`)
  - Tertiary: Automated file-path analysis (`.github/workflows/ci.yml` changes = always standard; `docs/` only = eligible for fast; `src/` with security keywords = standard)
  - Conflict resolution: Most restrictive tier wins if multiple signals conflict

  **Implementation Details:**
  - Modify `.github/workflows/ci.yml` to add tier detection job at start
  - Use GitHub Actions job-level `if:` conditions based on tier output
  - Add new script `scripts/ci-tier-classifier.js` for deterministic risk assessment
  - Fast-track coverage: Use `--changed` flag or similar to check coverage only on diff lines
  - Emergency tracking: Auto-create GitHub issue using `gh issue create` with template

- Rejected alternatives and why:
  - **Manual tier selection only**: Rejected because it creates friction; automated classification with override is better UX
  - **Skip all gates for fast-track**: Rejected—maintains lint/typecheck/test:run minimum viable safety
  - **Time-based tiering**: Rejected—unreliable; deterministic file-based classification preferred
  - **Branch-based tiering only**: Rejected—doesn't work for fork PRs; plan.md metadata more portable

- Affected interfaces and contracts:
  - `.github/workflows/ci.yml`: Major refactoring with conditional jobs
  - `docs/templates/plan.md`: Add `ci_tier` metadata field
  - `AGENTS.md`: Document tier selection rules and override procedures
  - New script: `scripts/ci-tier-classifier.js`
  - New script: `scripts/fast-track-coverage.js` (coverage on changed lines only)

## Edge Cases
- Edge case 1: PR initially qualifies for fast-track but subsequent pushes increase diff size >50 lines
  - Handling: Tier classifier runs on every push; if tier changes, full gate is enforced. PR check status updates accordingly.
- Edge case 2: Multiple commits in PR, some touching security-critical files and some not
  - Handling: Path-based analysis uses union of all changed files; any security-critical path = standard track
- Edge case 3: Emergency fix fails lint/typecheck
  - Handling: Emergency tier still requires lint/typecheck; failure blocks merge. Emergency doesn't mean "skip safety gates", it means "skip heavy validation gates."
- Edge case 4: Fast-track PR causes production incident
  - Handling: Incident triggers automatic tier downgrade for author; revert window analysis determines if fast-track policy needs adjustment
- Edge case 5: Plan.md declares `ci_tier: fast` but PR touches 200 lines
  - Handling: Automated classifier overrides plan.md; standard track enforced; bot comments with explanation
- Failure mode handling: All tier classification failures default to standard track (fail-safe). Emergency tier requires human approval + tracking issue creation; if tracking fails, emergency lane blocks.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-SEC-001 | Security-critical files (CI workflows, auth, crypto) never qualify for fast-track | Path pattern matching in classifier; `.github/workflows/*`, `**/auth/**`, `**/crypto/**` = auto standard | Unit test in `tests/ci-tier-classifier.test.ts` with fixture paths |
| INV-SEC-002 | Lint and typecheck gates are never skipped in any tier | Job-level `if:` conditions in ci.yml never exclude lint/typecheck jobs | CI workflow schema validation; golden regression test for workflow structure |
| INV-SEC-003 | Emergency tier requires human review + tracking issue before merge | Branch protection rule requires review; `scripts/emergency-tracker.js` creates issue via API; merge blocked until issue URL in PR body | Integration test with mock GitHub API; verify issue created with correct labels |
| INV-SEC-004 | Coverage requirement for fast-track: 100% on changed lines | `fast-track-coverage.js` uses git diff + coverage report to verify changed lines hit | Unit test with mock diff and coverage data; fail if any changed line uncovered |
| INV-SEC-005 | Tier classifier is deterministic: same inputs always produce same tier | Classifier uses only file paths, line counts, and plan.md (no timestamps, random, or external state) | Golden regression test: fixture PR scenarios produce expected tier |
| INV-SEC-006 | Revert window policy enforced for emergency fixes | Post-merge GitHub Action monitors for 2h; auto-revert on failure signal (CI failure, error rate spike) | Integration test with mock deployment failure; verify revert PR created |
| INV-SEC-007 | Author reputation tracking: repeated fast-track incidents trigger downgrade | Log fast-track outcomes; >2 incidents in 30 days = standard track only for author | Audit query in `scripts/ci-metrics.js`; alert on threshold breach |
| INV-SEC-008 | All tier selections are auditable: tier + reasoning stored in PR metadata | Bot comments tier decision with classification reasoning; stored in PR description or comment | Parse PR history in golden regression test; verify tier documented |

## Validation Checklist
- [ ] Unit/integration tests updated (new classifier tests, tier decision fixtures)
- [ ] Lint passes (biome)
- [ ] Typecheck passes (tsc --noEmit)
- [ ] Relevant golden/regression checks pass (test:golden includes new tier classifier scenarios)
- [ ] Documentation updated (AGENTS.md, docs/templates/plan.md, tier classification guide)

## Convergence Setup
- Initial issue batch target IDs: BK-020-TIER-001 (classifier implementation), BK-020-TIER-002 (workflow refactoring), BK-020-TIER-003 (emergency lane), BK-020-TIER-004 (metrics and monitoring)
- Implementer scope statement (batch-limited): Implement tier classifier script and fast-track lane only (standard and emergency lanes use existing infrastructure with conditional gates)
- Verifier scope statement (batch-only): Verify tier classification accuracy on historical PRs; verify fast-track does not skip lint/typecheck/coverage; verify emergency tracking issue creation
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
