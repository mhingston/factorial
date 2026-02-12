# Plan: BK-018 Phase 3 - Multi-Instance Coordination

## Metadata
- Date: 2026-02-12
- Author: OpenCode (gpt-5.2-codex)
- Related issue/PR: BK-018 (FA-006, FA-007)
- Risk level: high

## Requirement / Behavior Delta
- Current behavior: Factorial executes workflows within a single runtime instance; parallelism is scoped to worktree isolation and in-process parallel handlers.
- Target behavior: Publish deterministic evidence for multi-instance coordination (FA-006) and cross-repository workflow coordination (FA-007) with split-brain detection and transitive lock propagation.
- Why this change is needed: Full-autonomy promotion requires distributed orchestration with safe consensus guarantees and explicit cross-repo dependency tracking.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Execution engine | `packages/core/src/engine/index.ts` | Single-instance traversal; emits execution events | Needs coordination layer and distributed report hooks |
| Worktree isolation | `packages/core/src/worktree/` | Local worktree fan-out | Extend to multi-instance coordination evidence |
| Governance scripts | `scripts/*.js` | Report publication scripts | Add FA-006/FA-007 scripts + schemas |
| DTU runtime | `packages/core/src/dtu/*` | Deterministic runtime, reports, circuit breakers | Reuse reporting patterns for distributed execution |

## External Constraints
- API/provider constraints: None (report and simulation only; no real distributed network calls).
- Runtime/environment constraints: Must run deterministically in local CI with simulated consensus.
- Backward compatibility constraints: Existing DL/PB/AU gates must remain green.

## Design Outline
- Proposed approach:
  - FA-006: Implement a deterministic distributed coordination simulator (in-memory) with quorum, split-brain detection, and a report schema (`distributed_execution_report.v1`).
  - FA-007: Implement a cross-repo coordination simulator with manifest-based dependency tracking and transitive lock propagation; publish `cross_repo_workflow_report.v1` or add to FA-007 report.
  - Add scripts: `self-host:distributed` and `self-host:cross-repo-test` with evidence in `docs/metrics/reports/`.
  - Add tests to validate consensus decisions, partition handling, and lock propagation.
- Rejected alternatives and why:
  - Real network orchestration: too non-deterministic for CI and unnecessary for evidence gates.
  - Reusing worktree isolation without coordination model: does not satisfy FA-006/FA-007 requirements.
- Affected interfaces and contracts:
  - New report schemas + scripts
  - Updates to `docs/self-hosting-maturity-ladder.md` and `docs/spec-conformance-matrix.md`

## Edge Cases
- Edge case 1: Quorum cannot be reached → report must record split-brain detection and fail status.
- Edge case 2: Dependency cycles across repos → report must classify and fail.
- Failure mode handling: Deterministic error classification with explicit `fail` statuses and audit trails.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-FA-004 | Multi-instance consensus prevents split-brain | Quorum enforcement + partition simulation | FA-006 tests and report checks |
| INV-FA-005 | Cross-repo lock propagation is deterministic | Explicit dependency graph + lock resolution rules | FA-007 tests and report checks |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: FA-006, FA-007
- Implementer scope statement (batch-limited): Implement deterministic distributed coordination and cross-repo workflow reports only.
- Verifier scope statement (batch-only): Verify FA-006/FA-007 evidence and report schema correctness only.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
