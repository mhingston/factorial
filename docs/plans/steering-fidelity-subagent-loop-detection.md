# Plan: Steering Queue, Context Fidelity, Subagent Tools, Loop Detection, and GitHub Twin

## Metadata
- Date: 2026-02-12
- Author: AI Agent
- Related issue/PR: Improvement batch per user request
- Risk level: medium

## Requirement / Behavior Delta

### Current behavior:
1. **Steering**: No mid-task intervention mechanism in codergen handler
2. **Context fidelity**: Basic `compact`/`summary`/`full` modes exist but don't match Attractor spec Section 5.4 fidelity contract
3. **Subagent tools**: Manager loop exists but lacks full spawn/wait/close toolset per coding-agent-loop Section 7
4. **Loop detection**: No pattern detection for repeating tool calls (coding-agent-loop Section 2.10)
5. **DTU twins**: Only jira-issue and slack-channel twins exist
6. **Worktree subagents**: Manager loop doesn't support spawning subagents in different working directories (worktrees)

### Target behavior:
1. **Steering queue**: Enable mid-task message injection via `context.steering_queue` 
2. **Context fidelity**: Implement `full`/`summary:high`/`summary:low`/`compact` with proper context window management
3. **Subagent tools**: Add spawn/wait/close toolset for true subagent orchestration
4. **Loop detection**: Detect repeating patterns (1-3 call cycles) and inject warnings
5. **GitHub twin**: Add GitHub issue/PR twin for DTU scenario coverage
6. **Worktree-aware subagents**: Enable spawning subagents in git worktrees for parallel feature work

### Why this change is needed:
- Align with Attractor spec Section 5.4 (context fidelity) and coding-agent-loop spec Section 7 (subagents)
- Enable long-horizon workflows without context window exhaustion
- Improve unattended agent reliability via loop detection
- Expand DTU coverage for common SaaS integrations

## Codebase Research

| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Fidelity | `packages/core/src/engine/index.ts` | `resolveFidelity()` exists but limited modes | Needs summary:high/low split per spec |
| Fidelity preamble | `packages/core/src/handlers/builtin.ts` | `buildFidelityPreamble()` builds context | Needs to respect fidelity modes properly |
| Manager loop | `packages/core/src/handlers/builtin.ts` | `ManagerLoopHandler` with observe/steer/wait | Extend to support spawn/wait/close tools |
| Context | `packages/core/src/context/index.ts` | Key-value store with snapshots | Add steering_queue support |
| DTU twins | `packages/core/src/dtu/twins/` | jira-issue, slack-channel stubs | Add github-issue stub |
| Lint | `packages/core/src/lint/index.ts` | VALID_FIDELITY set | Update to include summary:high/low |

## External Constraints
- API/provider constraints: Must maintain backward compatibility with existing fidelity values
- Runtime constraints: Steering queue must be thread-safe
- Backward compatibility: Existing `summary` fidelity should map to `summary:high`

## Design Outline

### Proposed approach:

#### 1. Context Fidelity Enhancement
- Update `VALID_FIDELITY` to include `summary:high` and `summary:low`
- Enhance `buildFidelityPreamble()` with proper summarization per Attractor spec Section 5.4:
  - `full`: All context keys + conversation thread state (for session reuse)
  - `summary:high`: High-level semantic summaries, key outcomes from prior nodes (~60 keys)
  - `summary:low`: Minimal context, only critical system keys + last outcome (~10 keys)
  - `compact`: Current behavior (balanced key selection, ~25 keys)
- Update engine fidelity resolution to support edge>node>graph inheritance
- On resume after crash, degrade first node from `full` to `summary:high` (spec requirement)

#### 2. Steering Queue
- Add `steering_queue` key to context for queueing intervention messages
- Modify `CodergenHandler` to check for steering messages before LLM calls
- Support `SteeringTurn` injection via context updates
- Add `steer()` method to context API

#### 3. Subagent Tools Expansion
- Create `SubagentHandler` with spawn/wait/close capabilities
- Add tool definitions matching coding-agent-loop Section 7:
  - `spawn_agent`: Spawn child session with task + limits
  - `send_input`: Send message to running subagent
  - `wait`: Wait for subagent completion
  - `close_agent`: Terminate subagent
- Support depth limiting (default max depth: 1)
- Share execution environment between parent/child

#### 4. Loop Detection
- Add `LoopDetector` utility class
- Track tool call signatures (name + arguments hash)
- Detect patterns of length 1, 2, 3 over window of 10 calls
- Inject warning as steering message when pattern detected
- Configurable via `enable_loop_detection` (default: true)

#### 5. GitHub Twin
- Create `github-issue.stub.ts` with issue/PR operations
- Support: create, update, close, comment, label operations
- Add deterministic failure modes matching other twins
- Include in DTU scenario harness

#### 6. Worktree-Aware Subagents
- Extend `spawn_agent` tool to accept optional `working_dir` parameter
- Create `WorktreeManager` utility for git worktree lifecycle:
  - `create(worktree_path, branch_or_commit)`: Create new worktree
  - `remove(worktree_path)`: Clean up worktree
  - `list()`: List active worktrees
- Update `childExecutionAdapter` interface to support working directory override
- Enable parallel feature work pattern:
  - Parent agent spawns N subagents in N worktrees
  - Each subagent works on independent feature branch
  - Parent coordinates via wait/close tools
- Add worktree isolation validation (prevent cross-worktree file corruption)

### Rejected alternatives:
- **Full conversation history storage**: Too memory-intensive; use summaries instead per spec
- **Synchronous subagent spawning**: Would block parent; use async with wait tool instead
- **Automatic loop correction**: Too risky; warn and let agent decide instead

### Affected interfaces:
- `Context`: Add `steer()`, `steering_queue` support
- `Node`: Already has `fidelity` field, just expanding valid values
- `CodergenHandler`: Check steering queue before LLM calls
- `ExecutionEngine`: Initialize loop detector, pass to handlers

## Edge Cases
- **Edge case 1**: Steering queue with multiple messages - process all before LLM call
- **Edge case 2**: Loop detection false positives - use signature hashing + pattern length validation
- **Edge case 3**: Subagent depth limit exceeded - fail fast with clear error
- **Edge case 4**: Fidelity mode with no prior conversation - degrade gracefully to compact
- **Edge case 5**: GitHub twin rate limit simulation - use DTU failure catalog pattern

## High-Risk Invariants

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-001 | Subagent depth must not exceed max | Check depth in spawn_agent, fail if exceeded | Unit test with depth=0,1,2 |
| INV-002 | Steering messages must not persist across nodes | Clear queue after processing | Test multiple nodes with queued steering |
| INV-003 | Loop detection must not flag non-repeating patterns | Signature hashing + strict pattern match | Test with random vs repeating tool calls |
| INV-004 | Fidelity inheritance must follow edge>node>graph order | Resolution logic in engine | Test all combinations |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: fidelity-enhancement, steering-queue, subagent-tools, loop-detection, github-twin
- Implementer scope statement: Implement all 5 features with tests
- Verifier scope statement: Verify all features against spec references
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
