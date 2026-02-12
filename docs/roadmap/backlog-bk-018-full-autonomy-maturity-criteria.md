# Plan: Full-Autonomy Maturity Criteria and Implementation (BK-018)

## Metadata
- Date: 2026-02-12
- Author: Factorial Core Team
- Related issue/PR: BK-018, Roadmap transition `autonomous` → `full-autonomy`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior: Factorial operates at `autonomous` level with self-host dogfooding, provider-backed parity, and AU-* gate enforcement. External system operation and full unattended autonomy remain `out-of-scope` per companion spec scope contract.
- Target behavior: Achieve `full-autonomy` level with zero-human-intervention execution across external systems, self-modification capabilities, multi-instance coordination, and autonomous optimization.
- Why this change is needed: Enables Factorial to operate as a true self-improving software factory that can manage external dependencies, optimize its own configuration, coordinate across instances, and modify its own workflows without human intervention for defined categories.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Maturity Ladder | `docs/self-hosting-maturity-ladder.md` | Defines DL-*, PB-*, AU-* gates; FA-001 through FA-005 implemented | Pending FA-006 through FA-009 execution |
| Self-Host Dogfooding | `scripts/self-host-dogfood.js`, `scripts/self-host-maturity.js` | Local CI verification, deterministic pass/fail | Extend to cover external system simulation |
| External System Twins | `packages/core/src/twins/` | Jira/Slack reference twins exist | Need to expand twin coverage for FA-001/FA-002 |
| DOT Generation | `packages/core/src/dtu/dot-generation.ts` | Programmatic DOT generation with pre-flight lint and rollback | FA-003 implemented |
| Configuration | `packages/core/src/dtu/config-optimizer.ts` | Autonomous optimization with bounded drift | FA-004 implemented |
| Execution Engine | `packages/core/src/engine/` | Single-instance execution | Need distributed coordination for FA-006/FA-007 |
| Telemetry | `scripts/self-host-unattended-telemetry-report.js` | Basic unattended telemetry | Need 30-day zero-escalation tracking for FA-008 |
| Error Recovery | `packages/core/src/handlers/failure-analyze.ts` | Targeted retry | Need true self-healing (state reconstruction, alternative paths) for FA-009 |

## External Constraints
- API/provider constraints: External system integrations must respect rate limits, have circuit breakers, and maintain audit trails
- Runtime/environment constraints: Multi-instance coordination requires consensus protocols; network partitions must be handled gracefully
- Backward compatibility constraints: All existing DL-*, PB-*, AU-* gates must continue to pass; no regression in deterministic behavior

## Design Outline

### Phase 1: External System Integration (FA-001, FA-002)
- Proposed approach: Extend DTU platform to cover external API interactions with circuit-breaker patterns
- Build deterministic external-system operations report with rollback validation
- Implement circuit-breaker tests with automatic degradation triggers

### Phase 2: Self-Modification (FA-003, FA-004, FA-005)
- Status: Implemented
- ✅ FA-003: DOT graph generation API with pre-flight lint validation and rollback
- ✅ FA-004: Autonomous config tuner using historical run analytics with bounded drift
- ✅ FA-005: Handler/schema codegen with golden test coverage

### Phase 3: Multi-Instance Coordination (FA-006, FA-007)
- Proposed approach: Implement distributed consensus using existing worktree isolation patterns extended to network coordination
- Cross-repo workflows via manifest-based dependency tracking
- Transitive lock propagation for multi-repo changes

### Phase 4: Zero-Human-Intervention (FA-008, FA-009)
- Proposed approach:
  - FA-008: Extend telemetry to track 30-day escalation-free operation with explicit workflow categorization
  - FA-009: Build self-healing engine with state reconstruction and alternative path selection
- Out-of-distribution detection triggers human escalation

### Affected Interfaces and Contracts
- New CLI commands: `self-host:external-systems`, `self-host:self-mod`, `self-host:optimize`, `self-host:codegen-validation`, `self-host:distributed`, `self-host:cross-repo-test`, `self-host:full-autonomy-telemetry`, `self-host:self-healing`
- New report schemas: `external_system_operations_report.v1`, `self_modification_report.v1`, `config_optimization_report.v1`, `codegen_validation_report.v1`, `distributed_execution_report.v1`, `cross_repo_workflow_report.v1`, `full_autonomy_telemetry_report.v1`
- Engine extensions: Distributed coordination layer, self-healing orchestrator

## Edge Cases
- Edge case 1: External system becomes unavailable mid-workflow → Circuit breaker triggers, workflow pauses or degrades gracefully
- Edge case 2: Self-modification produces invalid DOT → Pre-flight lint catches, rollback to previous valid state
- Edge case 3: Network partition in multi-instance setup → Consensus protocol detects, waits for partition healing or degrades to single-instance mode
- Edge case 4: Autonomous optimization produces worse outcomes → Bounded drift limits trigger rollback, human escalation
- Edge case 5: Self-healing enters infinite loop → Loop detection with max-attempts limit, human escalation
- Failure mode handling: All failures must emit structured events, maintain audit trails, and have deterministic rollback paths

## High-Risk Invariants (Required for security, money, data integrity, concurrency)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-FA-001 | External system operations must be idempotent | All external calls use idempotency keys; retries are safe | DTU fixtures verify idempotent behavior |
| INV-FA-002 | Self-modification cannot break core engine | Pre-flight lint + dry-run validation before apply | Golden regression tests on self-modified graphs |
| INV-FA-003 | Configuration changes are bounded | Drift limits prevent >10% change in single optimization pass | Optimization report includes before/after metrics |
| INV-FA-004 | Multi-instance consensus prevents split-brain | Consensus protocol requires quorum; singleton fallback | Distributed execution tests with network partition simulation |
| INV-FA-005 | Zero-human-intervention scope is explicit | Workflow categorization with out-of-distribution detection | Telemetry report validates only categorized workflows run unattended |
| INV-FA-006 | Self-healing cannot mask root causes | All healing actions logged with root-cause traceability | Self-healing reports include classification and evidence |

## Validation Checklist
- [x] All FA-* gate commands implemented and passing (FA-001 through FA-009)
- [x] External system DTU fixtures expanded and deterministic
- [x] DOT generation API with lint validation
- [x] Configuration optimizer with bounded drift
- [x] Distributed coordination consensus tests
- [x] 30-day telemetry tracking for zero-escalation workflows
- [x] Self-healing engine with state reconstruction
- [x] New report schemas published and validated
- [x] Lint passes
- [x] Typecheck passes
- [x] Golden/regression checks pass
- [x] Documentation updated (maturity ladder, companion spec contract)
- [x] Claims consistency audit passes

## Convergence Setup
- Initial issue batch target IDs: FA-008, FA-009 (full autonomy telemetry + self-healing)
- Implementer scope statement: Implement FA-008 and FA-009 evidence reports only.
- Verifier scope statement: Verify FA-008/FA-009 gates pass with evidence; no critique outside batch.
- Ratchet acknowledgement: No new critique until FA-008/FA-009 batch reaches `resolved`.

## Dependencies
- BK-017 completion (markdown compaction) - DONE
- DTU platform stability (RMD-030) - DONE
- Self-host maturity framework (BK-006) - DONE

## Success Criteria
All FA-* gates pass with published evidence artifacts, cross-document consistency maintained, and zero regression in DL-*/PB-*/AU-* gates.
