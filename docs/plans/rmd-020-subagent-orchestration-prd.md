# PRD: RMD-020 First-Class Subagent Orchestration

## Document Metadata
- Status: In progress
- Owner: Factorial maintainers
- Date: 2026-02-11
- Target release: `0.2.x`
- Related roadmap issue: `docs/roadmap/0.2-prioritized-issues.md` (`RMD-020`)

## Summary
Upgrade `stack.manager_loop` from a polling stub into a deterministic subagent orchestration primitive with:
- explicit delegation contract fields,
- manager-cycle artifacts,
- bounded convergence semantics,
- and test coverage for success/failure/reopen paths.

This PRD focuses on incremental delivery that preserves current core execution semantics.

## Baseline (Current State)
- `stack.manager_loop` exists but does not execute a real delegation contract.
- It polls context keys (`stack.child.status`, `stack.child.outcome`) and times out after max cycles.
- No manager-specific artifact contract exists.

## Goals
1. Define deterministic manager/subagent handoff contracts.
2. Make manager behavior observable through explicit artifacts.
3. Support bounded convergence via stop conditions and lock decisions.
4. Add tests and CI coverage proving deterministic behavior.

## Non-Goals
- Full distributed scheduler.
- External queue/broker integration.
- Cross-repo multi-workspace delegation in this milestone.

## Functional Requirements
### FR1: Delegation Contract Keys
- `stack.manager_loop` must support explicit context keys for:
  - child status,
  - child outcome,
  - child lock decision,
  - child request payload.
- Defaults remain `stack.child.*` for backward compatibility.

### FR2: Deterministic Cycle Artifact
- Manager node writes `manager_loop.json` under `<logs_root>/<node_id>/`.
- Artifact includes:
  - node id,
  - child dotfile,
  - config (`actions`, polling, max cycles, stop condition),
  - cycle snapshots,
  - final status/failure reason.

### FR3: Stop-Condition Evaluation
- `manager_stop_condition` is evaluated each cycle with a stable context projection.
- Stop condition may return `SUCCESS`, `PARTIAL_SUCCESS`, or `FAIL` based on synthesized child outcome.

### FR4: Terminal Mapping
- Child terminal statuses map deterministically:
  - `completed` -> outcome-driven status (`SUCCESS`, `PARTIAL_SUCCESS`, `FAIL`),
  - `failed` -> `FAIL`,
  - `cancelled|canceled` -> `SKIPPED`.

### FR5: Convergence Signals
- Manager should expose summary fields via `context_updates`:
  - artifact path,
  - cycle count,
  - delegated flag,
  - last child status/outcome/lock.

## Phase Plan
### Phase A (Implemented in current branch)
- Add deterministic manager loop artifact.
- Add delegation action (`delegate`) that writes request contract to context.
- Add stop-condition evaluation with projected context.
- Add handler unit tests for:
  - successful completed child,
  - custom stop-condition closure,
  - max-cycle failure.

### Phase B (Implemented in current branch)
- Add explicit lock decision contract (`resolved|reopen`) with validation.
- Add manager lint rules for required attributes in strict profiles.
- Add golden workflow fixtures for manager convergence paths.

### Phase C (Implemented in current branch)
- Add optional delegated execution adapter (local child run hook).
- Add richer manager telemetry and replay support.

## Risks and Mitigations
- Risk: ambiguous stop conditions produce nondeterminism.
  - Mitigation: condition context projection is explicit and test-covered.
- Risk: infinite wait loops.
  - Mitigation: required bounded `manager_max_cycles` and deterministic fail path.
- Risk: artifact schema drift.
  - Mitigation: add golden fixtures in Phase B.

## Acceptance Criteria
1. `stack.manager_loop` writes deterministic cycle artifact.
2. Delegation contract keys are written/read predictably.
3. Stop-condition path is test-covered.
4. Max-cycle timeout remains bounded and explicit.
5. Existing tests remain green.

## Implementation Checklist
### Phase A
- [x] Add manager loop artifact contract (`manager_loop.json`)
- [x] Add delegation context contract for `delegate` action
- [x] Add stop-condition evaluation against stable context projection
- [x] Add handler unit tests for success/stop-condition/max-cycle failure

### Phase B
- [x] Add lock decision contract validation (`resolved|reopen`)
- [x] Add lint rules for manager loop contract completeness
- [x] Add golden workflows for manager convergence behavior
- [x] Add README manager-loop attribute documentation

### Phase C
- [x] Add optional child execution adapter for local delegated runs
- [x] Add richer telemetry summaries for replay/debug (`run_segments.json` restart boundary artifact + segment context keys)
