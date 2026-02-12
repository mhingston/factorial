# Plan: Self-Modification Production Use (FA-003 Operationalization)

## Metadata
- Date: 2026-02-12
- Author: Agent
- Related issue/PR: FA-003-PROD
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior: FA-003 (self-modification) is implemented and tested but not used in production workflows
- Target behavior: Active use of self-modification for routine workflow evolution (lint fixes, test updates, doc freshness)
- Why this change is needed: Prove FA-003 works in production and gather real evidence for full-autonomy promotion

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| DOT Generation | `packages/core/src/dtu/dot-generation.ts` | Generates DOT modifications | Productionize with safety checks |
| Lint Validation | `packages/core/src/lint/index.ts` | Validates DOT graphs | Pre-flight check before applying |
| Rollback | `packages/core/src/dtu/dot-generation.ts` | Rollback capability | Ensure tested in prod |
| Evidence Collection | `scripts/self-host-self-mod.js` | Report generation | Extend for production metrics |

## External Constraints
- API/provider constraints: Requires high-quality LLM outputs for safe modifications
- Runtime/environment constraints: Must run in isolated branch/PR for safety
- Backward compatibility constraints: Never auto-merge to main without review

## Design Outline
- Proposed approach:
  1. Identify safe self-modification scenarios (low-risk categories)
  2. Create gated workflow: propose → validate → human review → apply
  3. Implement automatic PR creation for DOT modifications
  4. Add metrics collection for self-modification success rates
  5. Build rollback triggers for failed modifications
  6. Create evidence dashboard

- Affected interfaces:
  - New CLI command: `factorial workflow:self-modify --dry-run`
  - Extended report: `self_modification_report.v1`

## Edge Cases
- Edge case 1: Invalid DOT generation → Caught by pre-flight lint
- Edge case 2: Semantic errors not caught by lint → Rollback on test failure
- Edge case 3: Cascade failures → Limit scope to single workflow per modification

## High-Risk Invariants
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-001 | No auto-merge to main | Require human PR review | GitHub branch protection rules |
| INV-002 | Rollback must always work | Versioned DOT files | Test rollback in CI |
| INV-003 | Failed modifications don't break prod | Feature flags for new workflows | Gradual rollout |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: FA-003-PROD-001 through FA-003-PROD-005
- Implementer scope statement: Production self-modification workflow with safety gates
- Verifier scope statement: Verify safety invariants and rollback effectiveness
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
