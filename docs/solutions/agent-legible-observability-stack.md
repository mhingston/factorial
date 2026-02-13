---
title: "Agent-Legible Observability Stack"
category: "reliability"
tags:
  - "observability"
  - "agent-autonomy"
  - "victoria-metrics"
  - "worktree-isolation"
date: "2026-02-13"
trigger: "BK-022 required enabling 6+ hour autonomous agent runs via queryable observability"
---

# Problem
Agents can't self-diagnose issues without human interpretation of logs/metrics. When agents run autonomously for extended periods (6+ hours), they encounter failures that require understanding system state. Without structured query interfaces (LogQL/PromQL/TraceQL), agents must either fail or escalate to humans for log analysis.

# Solution Pattern
Local ephemeral observability stack with queryable APIs enabling agent self-diagnosis:

1. **Docker-Based Stack** (`docker/observability/docker-compose.yml`):
   - **Vector** (128M memory): Log collection and routing
   - **Victoria Logs** (512M memory): Log storage with LogQL query API
   - **Victoria Metrics** (256M memory): Metrics storage with PromQL API
   - **Victoria Traces** (512M memory): Distributed tracing with TraceQL API

2. **Worktree Isolation**: Each worktree gets isolated stack instance:
   - Container names: `vector-${WORKTREE_ID}`, `victoria-logs-${WORKTREE_ID}`
   - Network: `factorial-observability-${WORKTREE_ID}`
   - Data directory: `${WORKTREE_ROOT}/.factorial/observability/`
   - Deterministic ports via `hashCode(worktreeId)`

3. **CLI Integration** (`packages/cli/src/index.ts`):
   - `observability:start` - Launch stack for current worktree
   - `observability:stop [--cleanup]` - Stop and optionally remove data
   - `observability:status` - Check stack health and endpoint URLs
   - `observability:query --type logs|metrics|traces --query "..."` - Execute queries

4. **Automatic Data Redaction**: Vector transform redacts sensitive patterns:
   - API keys, tokens, passwords, secrets
   - Prevents credential leakage in shared observability data

## Query Examples
```bash
# Query recent errors
npm run observability:query -- --type logs --query 'level=~"error|fatal"'

# Query metrics
npm run observability:query -- --type metrics --query 'rate(http_requests_total[5m])'

# Query traces
npm run observability:query -- --type traces --query '{service="factorial-agent"}'
```

# Key Insight
**What the agent can't query doesn't exist.** Observability data without query APIs is invisible to autonomous agents. Structured query interfaces (LogQL/PromQL/TraceQL) enable agents to:
- Self-diagnose failures by querying error logs
- Detect anomalies via metrics trend analysis
- Trace request flows across components
- Make progress without human intervention

# Implementation References
- Files touched:
  - `docker/observability/docker-compose.yml` (Vector + Victoria stack)
  - `docker/observability/vector.toml` (log routing and redaction)
  - `packages/core/src/observability/stack-manager.ts` (lifecycle management)
  - `packages/core/src/observability/query-client.ts` (query interfaces)
  - `packages/cli/src/index.ts` (CLI commands)
- Tests added/updated:
  - `packages/core/src/observability/stack-manager.test.ts` (17/17 passing)
  - `packages/core/src/observability/query-client.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-022-agent-legible-observability.md`
  - `docs/reviews/bk-022-phase-1-2-review.md`

# Validation Evidence
- What validated correctness:
  - 17/17 tests passing in stack-manager.test.ts
  - Worktree isolation verified (container and network names use WORKTREE_ID)
  - Deterministic port allocation confirmed via hashCode() test
  - Auto-cleanup removes all worktree-specific data
  - Docker availability check prevents stack start when Docker unavailable
  - Query client returns structured errors for non-existent worktrees
- What validated reliability over time:
  - Memory limits enforced: Vector 128M, Victoria Logs 512M, Victoria Metrics 256M, Victoria Traces 512M
  - Redaction patterns verified in vector.toml
  - Graceful degradation verified (Docker not available → clear error message)
  - `npm run lint`
  - `npm run typecheck`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern
- Update location:
  - `AGENTS.md` references observability commands in CLI tooling section
  - Self-hosting maturity ladder acknowledges observability as foundation for full-autonomy

# Reuse Guidance
- When to apply this pattern:
  - Agents need to run autonomously for extended periods (1+ hours)
  - Self-diagnosis and recovery without human escalation is required
  - Log/metric/trace data is already available but not queryable
  - Worktree-scoped isolation is acceptable (ephemeral data)
- When not to apply:
  - Long-term data retention required (use centralized observability)
  - Resource constraints prevent running local Docker stack
  - Agents don't need self-diagnosis (short runs, human-in-the-loop)
  - Cross-worktree correlation required (use shared observability backend)
- Known tradeoffs:
  - Ephemeral data lost when worktree is cleaned up
  - Resource overhead: ~1.4GB RAM for full stack
  - Requires Docker available on agent host
  - Query latency higher than in-process logging
  - Not a replacement for centralized observability (complementary)
