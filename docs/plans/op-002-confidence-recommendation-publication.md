# Plan: OP-002 Confidence-Tuning Recommendation Publication Loop

## Metadata
- Date: 2026-02-12
- Author: Agent
- Related issue/PR: OP-002 (operational follow-up)
- Risk level: low

## Requirement / Behavior Delta
- Current behavior: `confidence-tune` command generates recommendations but there's no standardized publication mechanism that integrates with the review workflow.
- Target behavior: Add deterministic `confidence:publish` command that generates recommendation artifacts consumable as review inputs to the lock-governed workflow.
- Why this change is needed: Enables data-driven confidence threshold tuning with explicit sample sufficiency checks, recommendation-only policy (no auto-apply), and integration with the Plan → Review → Compound loop.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Confidence tune | `scripts/confidence-tune-publish.js` | Already implemented with quantile-based recommendations | Needs npm script wiring and tests |
| Confidence results | `packages/core/src/engine/confidence-escalation.test.ts` | Per-run confidence artifacts | Source data for publication |
| Review template | `docs/templates/review.md` | Standard review structure | Needs confidence recommendation hook |
| Package scripts | `package.json` | Has `confidence-tune` CLI command | Needs `confidence:publish` script |

## External Constraints
- API/provider constraints: N/A - works from local artifacts only
- Runtime/environment constraints: Must work in CI and locally without additional secrets
- Backward compatibility constraints: Existing `confidence_result.json` format unchanged

## Design Outline
- Proposed approach:
  1. Wire existing `confidence-tune-publish.js` to `npm run confidence:publish`
  2. Create comprehensive test suite for publication command
  3. Update review template to include confidence recommendation section
  4. Create solution document for reuse guidance
  5. Update roadmap and active-handoff to mark OP-002 complete
- Rejected alternatives and why:
  - Auto-apply recommendations: Violates fail-closed policy, requires human review
  - Real-time publication: Would require daemon process, unnecessary complexity
- Affected interfaces and contracts:
  - `confidence_tune_publication_report.v1` schema (already implemented)
  - `npm run confidence:publish` command
  - Review template with optional confidence recommendation section

## Edge Cases
- Edge case 1: No confidence artifacts found - command fails with clear error
- Edge case 2: Insufficient samples (< min-samples) - reports status but doesn't block
- Edge case 3: Invalid confidence result JSON - skipped with warning in report
- Edge case 4: Multiple escalation targets - ranks by frequency
- Failure mode handling: Invalid artifacts logged but don't fail entire publication

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| CTR-INV-001 | Recommendation-only policy (no auto-apply) | Hardcoded `auto_apply_supported: false` in report | Test asserts policy field |
| CTR-INV-002 | Human lock review required | `requires_human_lock_review: true` in policy | Test validates policy metadata |

## Validation Checklist
- [x] Unit/integration tests created (`packages/cli/src/confidence-tune-publish.test.ts`)
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Tests pass (`npm run test:run -- confidence-tune-publish`)
- [ ] Documentation updated (roadmap, active-handoff, solution)

## Convergence Setup
- Initial issue batch target IDs: OP-002
- Implementer scope statement: Add tests, wire npm script, update docs, verify recommendation-only policy
- Verifier scope statement: Verify tests cover schema validation, insufficient samples, route ranking, and policy invariants
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
