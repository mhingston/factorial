# Plan: Git Worktree Parallel Isolation

## Metadata
- Date: 2026-02-12
- Author: @mhingston
- Related issue/PR: RMD-036 (new roadmap item)
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior: Parallel branches share the same filesystem, running in isolated contexts but with potential file collisions
- Target behavior: Optional git worktree isolation for parallel branches, enabling true filesystem isolation with deterministic merge at fan_in
- Why this change is needed: Supports parallel code generation/modification workflows where branches must not interfere with each other's file operations

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Parallel fan_out | `packages/core/src/handlers/builtin.ts:2148-2250` | Creates branch engines with cloned contexts and separate logs_root | Need to add worktree creation before branch execution |
| Parallel fan_in | `packages/core/src/handlers/builtin.ts:2400-2515` | Merges branch outcomes using strategies (best_score, consensus, arbiter) | Need to add worktree merge step before outcome merge |
| Branch engine | `packages/core/src/engine/index.ts:119` | Creates isolated engine instance with separate logs_root | May need cwd parameter for worktree directory |
| DOT attributes | `packages/core/src/types/index.ts` | Defines attribute types for handlers | Need to add worktree isolation attributes |
| Lint rules | `packages/core/src/lint/index.ts` | Validates DOT graph structure | Need to add worktree attribute validation |

## External Constraints
- API/provider constraints: Requires git >= 2.5 (worktree support added in 2.5)
- Runtime/environment constraints: Must be run inside a git repository
- Backward compatibility constraints: Worktree isolation is opt-in; existing workflows continue to work unchanged

## Design Outline
- Proposed approach:
  1. Add `worktree_isolation` boolean attribute to `parallel.fan_out` nodes
  2. Add `worktree_merge_strategy` attribute (`fail`, `ours`, `theirs`) to `parallel.fan_in` nodes
  3. Create `WorktreeManager` utility class in `packages/core/src/worktree/`:
     - `createWorktree(branchId, baseRef)` - creates worktree from current HEAD
     - `mergeWorktree(branchId, strategy)` - merges worktree changes back
     - `cleanupWorktree(branchId)` - removes worktree
  4. Modify `ParallelHandler` to create worktrees when `worktree_isolation=true`
  5. Modify `FanInHandler` to merge worktrees before merging outcomes
  6. Worktrees stored in `.factorial/worktrees/<run-id>/<branch-id>/`

- Rejected alternatives and why:
  - Docker containers: Too heavy, requires Docker daemon
  - Copy-on-write filesystems: Not portable across platforms
  - Manual file copying: Complex and error-prone

- Affected interfaces and contracts:
  - `ManagerChildExecutionRequest` - may add `worktree_path` field
  - New artifact: `worktree_manifest.json` per worktree
  - Context keys: `parallel.worktree.<branch_id>.path`

## Edge Cases
- Edge case 1: Branch fails - worktree preserved for debugging, cleaned up on workflow completion
- Edge case 2: Merge conflict with `fail` strategy - fan_in returns FAIL status with conflict details
- Edge case 3: Not in git repo - handler returns FAIL with clear error message
- Edge case 4: Dirty working tree - either fail or auto-stash (configurable via `worktree_allow_dirty`)
- Edge case 5: Nested parallel branches - each level creates nested worktrees
- Failure mode handling: All worktrees cleaned up on SIGINT/SIGTERM via abort signal

## High-Risk Invariants (Required for security, money, data integrity, concurrency)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| WT-001 | Worktrees are always cleaned up after use | `finally` blocks in handlers + abort signal handlers | Test with forced termination |
| WT-002 | Worktree paths are within `.factorial/worktrees/` | Path validation in WorktreeManager | Unit test path traversal attempts |
| WT-003 | Git commands executed safely (no shell injection) | Use spawn with array args, never shell | Review all spawn calls |
| WT-004 | Merge conflicts don't corrupt main working tree | Atomic merge operations, validate before apply | Test with conflicting changes |
| WT-005 | Worktree isolation doesn't bypass context isolation | Context still cloned per branch | Regression test context isolation |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: WT-001 through WT-005, plus implementation tasks
- Implementer scope statement (batch-limited): Implement core worktree isolation with fail-on-conflict strategy
- Verifier scope statement (batch-only): Verify worktree creation, isolation, cleanup, and conflict handling
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
