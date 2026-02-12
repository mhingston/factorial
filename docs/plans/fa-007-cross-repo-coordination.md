# Plan: FA-007 Cross-Repository Coordination Validation

## Metadata
- Date: 2026-02-12
- Author: Factorial Agent
- Related issue/PR: FA-007
- Risk level: medium

## Requirement / Behavior Delta
- Current behavior: Basic cross-repo dependency tracking with cycle detection and lock propagation
- Target behavior: Full production-ready cross-repo coordination with network failure handling, rollback coordination, and comprehensive validation scenarios
- Why this change is needed: FA-007 requires demonstrating production-grade cross-repo workflow orchestration for multi-repository AI pipelines

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Cross-repo coordination | `packages/core/src/dtu/cross-repo-coordination.ts` | Basic dependency tracking, cycle detection, lock propagation | Need to extend for network failures and rollback |
| Tests | `packages/core/src/dtu/cross-repo-coordination.test.ts` | 3 basic test scenarios | Need comprehensive scenarios with 3+ repos |
| CLI | `packages/cli/src/index.ts` | No cross-repo validation command | Add `cross-repo:validate` command |
| Validation script | `scripts/self-host-cross-repo-test.js` | Basic 2-scenario validation | Extend with production scenarios |

## External Constraints
- API/provider constraints: Must work with existing Zod schemas
- Runtime/environment constraints: Must be deterministic for CI
- Backward compatibility constraints: Existing schema `cross_repo_workflow_report.v1` must remain valid

## Design Outline
- Proposed approach:
  1. Extend types to support network failures and rollback coordination
  2. Add execution state tracking across repos
  3. Implement transitive dependency chain validation
  4. Add CLI command for cross-repo validation
  5. Create comprehensive test scenarios with 3+ repos
  6. Update production validation script
- Rejected alternatives and why: N/A - extending existing system
- Affected interfaces and contracts: New report schema `cross_repo_coordination_report.v1`, extended CLI

## Edge Cases
- Edge case 1: Network partition between repos during coordination
- Edge case 2: Cascading failure across transitive dependency chain
- Edge case 3: Partial rollback when some repos succeed and others fail
- Failure mode handling: Lock propagation halts on failure, rollback coordinated across affected repos

## High-Risk Invariants (Required for security, money, data integrity, concurrency)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-001 | Lock state must be consistent across all repos in dependency chain | Transitive propagation with cycle detection | Unit tests verify propagation correctness |
| INV-002 | Rollback must affect all repos in a coordinated transaction | Rollback coordinator tracks transaction boundaries | Integration tests verify atomic rollback |
| INV-003 | Network failures must not corrupt lock state | Idempotent lock operations with validation | Failure simulation tests |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: FA-007
- Implementer scope statement: Extend cross-repo coordination with production validation features
- Verifier scope statement: Verify all scenarios pass and report schema is valid
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
