# Plan: BK-022 Agent-Legible Observability

## Metadata
- Date: 2026-02-13
- Author: Agent (OpenCode)
- Related issue/PR: `BK-022`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - Factorial has structured logging via `console.log`/`console.error` in CLI (`packages/cli/src/index.ts:265-307`)
  - Telemetry aggregation exists via `TelemetryAggregationService` (`packages/core/src/dtu/telemetry-aggregation-service.ts`)
  - Full autonomy telemetry with schema validation (`packages/core/src/dtu/full-autonomy-telemetry.ts`)
  - DTU scenario harness provides deterministic testing with satisfaction scoring (`packages/core/src/dtu/scenario-harness.ts`)
  - Worktree isolation implemented for parallel execution (`packages/core/src/worktree/manager.ts`)
  - Logs stored as flat files in `logs/{scenario}/stdout.log` and `logs/{scenario}/stderr.log`
  - Observability is human-readable only; agents cannot query logs, metrics, or traces programmatically
- Target behavior:
  - Agents have direct queryable access to logs, metrics, and traces via standardized APIs
  - Local ephemeral observability stack per worktree: Vector (collection) → Victoria Logs/Metrics/Traces (storage)
  - Agents use LogQL/PromQL/TraceQL for self-diagnosis, validation, and reasoning
  - Worktree-scoped isolation ensures no data leakage across parallel branches
  - Automatic teardown after task completion
  - DTU scenarios can validate observability data via query assertions
  - CI supports agent-driven SLO validation using observability queries
- Why this change is needed:
  - Enable 6+ hour autonomous runs where agents validate their own work
  - Follow OpenAI pattern: agents self-diagnose via structured queries rather than human-readable logs
  - Support autonomous loops that verify service startup timing, span latency, and error patterns
  - Required for `full-autonomy` maturity level progression

## Codebase Research

| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Logging | `packages/cli/src/index.ts:265-357` | Console-based logging to stdout/stderr | Migrate to structured JSON logging for Vector ingestion |
| Telemetry | `packages/core/src/dtu/telemetry-aggregation-service.ts` | File-based daily aggregation with anomaly detection | Extend to emit metrics in Prometheus format |
| Full Autonomy Telemetry | `packages/core/src/dtu/full-autonomy-telemetry.ts` | Schema-validated telemetry runs with OOD detection | Add trace correlation IDs for distributed tracing |
| DTU Contracts | `packages/core/src/dtu/contracts.ts` | Twin invocation timing and deterministic responses | Add trace/span context to timing metadata |
| Scenario Harness | `packages/core/src/dtu/scenario-harness.ts` | Fixture-driven validation with satisfaction scoring | Add observability query assertions as new assertion type |
| Worktree Manager | `packages/core/src/worktree/manager.ts` | Git worktree isolation for parallel branches | Mount observability stack per worktree at `.factorial/observability/{worktree_id}/` |
| Log Storage | `logs/{scenario}/stdout.log` | Flat text files | Migrate to Victoria Logs with LogQL API |
| CLI Commands | `packages/cli/src/index.ts` | Console output only | Add `observability:*` command family for stack lifecycle and query proxy |

## External Constraints
- API/provider constraints:
  - Vector must support log/metric/trace routing via VRL transforms
  - VictoriaMetrics/VictoriaLogs/VictoriaTraces must expose HTTP APIs on non-conflicting ports per worktree
  - LogQL/PromQL/TraceQL query languages are stable but implementation-specific
- Runtime/environment constraints:
  - Each worktree requires isolated observability stack (no shared ports/storage)
  - Port allocation must avoid collisions (suggest: base port 9428 + worktree offset)
  - Container support optional but preferred for stack isolation
  - Resource limits: ephemeral stacks must not exceed 2GB RAM per worktree
- Backward compatibility constraints:
  - Existing `logs/` directory structure preserved for human debugging
  - Console logging remains available; JSON structured logging is additive
  - Telemetry aggregation service continues file-based storage alongside metric export
  - Worktree isolation behavior unchanged for non-observability scenarios

## Design Outline
- Proposed approach:
  1. **Structured Logging Layer**: Add JSON-structured logger wrapper that outputs to stdout (for Vector) and retains human-readable format
  2. **Vector Configuration**: Per-worktree Vector config for log→VictoriaLogs, metric→VictoriaMetrics, trace→VictoriaTraces routing
  3. **Observability Stack Manager**: New `ObservabilityStackManager` class (similar pattern to `WorktreeManager`) to orchestrate Victoria components per worktree
  4. **Agent Query Interface**: CLI commands for agents to execute LogQL/PromQL/TraceQL queries against local stack
  5. **DTU Integration**: Extend scenario harness with observability assertion type that queries before/after state
  6. **Lifecycle Hooks**: Automatic stack startup on worktree creation, teardown on cleanup
  7. **CI Integration**: New `observability:validate-slo` command for agent-driven SLO checks

- Rejected alternatives and why:
  - **Centralized observability stack** (shared across worktrees): Rejected due to data leakage risk between parallel branches; violates worktree isolation invariants
  - **OpenTelemetry Collector instead of Vector**: Rejected to reduce dependency surface; Vector has simpler config and better VRL transform support for local workflows
  - **Tempo instead of Victoria Traces**: Rejected to keep stack unified under VictoriaMetrics ecosystem; simpler operational model
  - **Persistent observability storage**: Rejected; ephemeral per-worktree aligns with factorio philosophy of clean state per run

- Affected interfaces and contracts:
  - New `ObservabilityStackConfig` interface for per-worktree stack configuration
  - Extended `WorktreeManager` to coordinate with `ObservabilityStackManager`
  - New CLI commands: `observability:up`, `observability:down`, `observability:query`, `observability:validate-slo`
  - Extended DTU scenario fixture schema with `observability_assertions` array
  - New environment variables: `FACTORIAL_OBSERVABILITY_ENABLED`, `FACTORIAL_OBSERVABILITY_BASE_PORT`

## Edge Cases
- Edge case 1: Port collision when multiple worktrees spawn simultaneously
  - Mitigation: Dynamic port allocation with retry logic; base port + hash(worktree_id) % 1000
- Edge case 2: Observability stack fails to start (resource exhaustion)
  - Mitigation: Graceful degradation with fallback to file-based logging; agent receives clear error for query attempts
- Edge case 3: Worktree cleanup interrupted (process killed)
  - Mitigation: Stack writes PID files; periodic GC job cleans orphaned stacks on next run
- Edge case 4: Query timeouts during heavy workload
  - Mitigation: Query timeout config (default 30s); agents can use range queries with smaller time windows
- Edge case 5: Disk exhaustion from high-volume traces
  - Mitigation: Default 1GB storage limit per stack with LRU eviction; configurable via `max_storage_bytes`

## High-Risk Invariants (Required for security, data integrity, worktree isolation)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK022-INV-01 | Observability data never leaks across worktrees | Each worktree has isolated Victoria storage directories and distinct port ranges | DTU scenario tests query cross-worktree isolation; verify empty results for foreign worktree IDs |
| BK022-INV-02 | Stacks are always torn down after worktree cleanup | `try/finally` in worktree merge + abort signal handler for stack shutdown; PID file tracking for orphaned process cleanup | CI test: simulate kill -9 during workflow, verify no lingering Victoria processes |
| BK022-INV-03 | Query results are deterministic for same time range | Victoria components configured with deterministic timestamp indexing; queries include explicit `start`/`end` parameters | Golden regression tests for query results on fixed fixture data |
| BK022-INV-04 | Stack startup failures block worktree creation | `ObservabilityStackManager.createStack()` throws on failure; `WorktreeManager.createWorktree()` propagates error | Unit test: mock port conflict, verify worktree creation fails fast with actionable error |
| BK022-INV-05 | No sensitive data in observability exports | Automatic redaction of environment variables, tokens, and secrets via Vector VRL transform | DTU scenario with secret-containing log line; query result shows `[REDACTED]` |
| BK022-INV-06 | Resource limits enforced per stack | Victoria processes started with cgroup/memory limits where available; storage quotas enforced | CI test: inject 10GB log stream, verify LRU eviction triggers and stack remains stable |

## Validation Checklist
- [ ] Unit/integration tests updated
  - `packages/core/src/observability/stack-manager.test.ts` - Stack lifecycle (create/query/teardown)
  - `packages/core/src/observability/query-client.test.ts` - LogQL/PromQL/TraceQL query execution
  - `packages/core/src/worktree/manager.test.ts` - Integration with observability stack
  - `packages/core/src/dtu/scenario-harness.test.ts` - Observability assertion type coverage
- [ ] Lint passes (`npm run lint`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Relevant golden/regression checks pass (`npm run test:golden`)
- [ ] Documentation updated
  - `README.md` - Observability commands and agent query examples
  - `AGENTS.md` - How agents use observability for self-diagnosis
  - `docs/observability/` - Architecture and query patterns

## Convergence Setup
- Initial issue batch target IDs:
  - `BK-022A` Structured logging foundation and Vector configuration
  - `BK-022B` ObservabilityStackManager implementation with Victoria orchestration
  - `BK-022C` Worktree integration and lifecycle hooks
  - `BK-022D` Agent query CLI commands (LogQL/PromQL/TraceQL)
  - `BK-022E` DTU scenario harness observability assertions
  - `BK-022F` CI SLO validation command and documentation
- Implementer scope statement (batch-limited):
  - Implement `BK-022A` through `BK-022F` as foundational infrastructure
  - Do NOT implement: distributed tracing across external systems, production-grade Victoria clustering, or long-term storage retention policies
- Verifier scope statement (batch-only):
  - Verify only `BK-022A` through `BK-022F` with explicit `pass|fail` evidence per invariant
  - Validate no data leakage between worktrees via DTU isolation scenarios
- Ratchet acknowledgement: no new critique until active batch is `resolved`.

## Implementation Details (Agent Query Examples)

### Example 1: Verify Service Startup Timing
```
Query (PromQL):
  factorial_service_startup_duration_ms{service="cli"} < 800

Agent prompt:
  "Verify service startup completes in under 800ms"

Expected validation:
  - Query returns at least one sample
  - All samples have value < 800
```

### Example 2: Critical Span Latency Check
```
Query (TraceQL):
  {span.name=~"user_journey.*"} | duration > 2s

Agent prompt:
  "No span in critical user journeys exceeds 2 seconds"

Expected validation:
  - Query returns zero spans
```

### Example 3: Error Pattern Detection
```
Query (LogQL):
  {app="factorial"} |= "ERROR" |~ "(timeout|rate.*limit)" [5m]

Agent prompt:
  "Query logs for error patterns after this workflow run"

Expected validation:
  - Count errors by pattern
  - Compare against baseline from workflow start timestamp
```

### Example 4: DTU Scenario Observability Assertion
```json
{
  "scenario_id": "observability_smoke_test",
  "suite": "smoke",
  "description": "Verify telemetry is queryable after twin invocation",
  "request": { ... },
  "expected": { ... },
  "observability_assertions": [
    {
      "type": "metric",
      "query": "twin_invocation_latency_ms{twin_id=\"jira.issue\"}",
      "assertion": "exists",
      "timeout_ms": 5000
    },
    {
      "type": "log",
      "query": "{app=\"factorial\"} |= \"twin invocation completed\"",
      "assertion": "count >= 1"
    }
  ]
}
```

## Resource Considerations

Per-worktree resource allocation:
- VictoriaLogs: 512MB RAM, 1GB storage (configurable)
- VictoriaMetrics: 256MB RAM, 512MB storage (configurable)
- VictoriaTraces: 512MB RAM, 1GB storage (configurable)
- Vector agent: 128MB RAM (shared per worktree)

Total per worktree: ~1.4GB RAM, ~2.5GB storage (with default limits)

Recommended limits:
- Max 3 concurrent worktrees with observability on developer machines
- CI environments: disable observability or use single shared read-only instance for validation

## Architecture Notes

Stack composition per worktree:
```
.factorial/observability/{worktree_id}/
├── vector/
│   ├── vector.toml          # Routing config
│   └── pid                  # Process tracking
├── victoria-logs/
│   ├── data/                # Log storage
│   └── pid                  # Process tracking
├── victoria-metrics/
│   ├── data/                # Metric storage
│   └── pid                  # Process tracking
├── victoria-traces/
│   ├── data/                # Trace storage
│   └── pid                  # Process tracking
└── ports.json               # Allocated ports for this stack
```

Port allocation strategy:
- Base port: 9428 (from `FACTORIAL_OBSERVABILITY_BASE_PORT`)
- Offset calculation: `offset = hash(worktree_id) % 1000`
- VictoriaLogs: base + offset + 0
- VictoriaMetrics: base + offset + 1
- VictoriaTraces: base + offset + 2
- Vector API: base + offset + 3

This ensures deterministic port assignment while minimizing collision probability across worktrees.

## Open Questions
1. Should we support OTLP export for external observability systems (Datadog, Grafana Cloud)?
2. Do we need query result caching for expensive TraceQL queries?
3. Should we implement a query planner to optimize complex LogQL queries?

These questions are out of scope for BK-022 but noted for future iterations.
