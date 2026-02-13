# Agent-Legible Observability (BK-022)

This module provides agent-legible access to logs, metrics, and traces for Factorial workflows.

## Overview

The observability stack enables agents to:
- Query logs using LogQL for debugging and validation
- Query metrics using PromQL for performance monitoring
- Query traces using TraceQL for distributed tracing analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Factorial Application                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   CLI/API    │  │    DTU       │  │   Workflow   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
└─────────┼─────────────────┼─────────────────┼───────────────┘
          │                 │                 │
          │   JSON Logs     │                 │
          └─────────────────┘                 │
                        │                     │
                        ▼                     │
          ┌─────────────────────┐             │
          │       Vector        │◄────────────┘
          │   (Collection)      │   Metrics/Traces
          └──────────┬──────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐
│Victoria Logs │ │Victoria  │ │Victoria  │
│  (LogQL)     │ │ Metrics  │ │ Traces   │
└──────────────┘ │(PromQL)  │ │(TraceQL) │
                 └──────────┘ └──────────┘
```

## Components

- **Vector**: Log collection and routing with VRL transforms
- **Victoria Logs**: Log storage with LogQL query interface
- **Victoria Metrics**: Metric storage with PromQL query interface
- **Victoria Traces**: Trace storage with TraceQL query interface

## Worktree Isolation

Each git worktree gets its own isolated observability stack:
- Dedicated ports (base port + hash offset)
- Separate data directories
- Isolated Docker networks
- No cross-worktree data leakage

## Quick Start

### Start the Stack

```bash
# Using npm script
npm run observability:start

# Using CLI
factorial observability:start

# With custom options
factorial observability:start --worktree-id my-feature --base-port 10000
```

### Query Data

```bash
# Query logs
factorial observability:query --type logs --query '{app="factorial"} |= "ERROR"'

# Query metrics
factorial observability:query --type metrics --query 'up'

# Query traces
factorial observability:query --type traces --query '{span.name="user_journey"}'

# With time range
factorial observability:query --type logs --query '{app="factorial"}' \
  --start 2026-02-13T00:00:00Z --end 2026-02-13T23:59:59Z
```

### Check Status

```bash
factorial observability:status
```

### Stop the Stack

```bash
# Stop but keep data
npm run observability:stop

# Stop and clean up all data
npm run observability:stop -- --cleanup
```

## Query Examples

### LogQL (Logs)

```bash
# All factorial logs
{app="factorial"}

# Error logs
{app="factorial"} |= "ERROR"

# Logs with specific pattern
{app="factorial"} |~ "(timeout|rate.*limit)"

# Recent logs (last 5 minutes)
{app="factorial"} [5m]
```

### PromQL (Metrics)

```bash
# Service uptime
up{job="factorial"}

# Request rate
rate(factorial_requests_total[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(factorial_request_duration_seconds_bucket[5m]))
```

### TraceQL (Traces)

```bash
# All traces
{}

# Traces by service
{service.name="factorial"}

# Traces with duration > 2s
{.duration > 2s}

# Traces with specific span name
{span.name=~"user_journey.*"}
```

## Programmatic Usage

```typescript
import { ObservabilityStackManager, queryLogs, queryMetrics, queryTraces } from '@mhingston5/factorial/core';

// Start stack
const manager = new ObservabilityStackManager({ repoRoot: process.cwd() });
const config = await manager.getStackConfig('my-worktree');
const info = await manager.createStack(config);

// Query data
const logs = await queryLogs('my-worktree', '{app="factorial"}');
const metrics = await queryMetrics('my-worktree', 'up');
const traces = await queryTraces('my-worktree', '{service.name="factorial"}');

// Clean up
await manager.cleanupStack('my-worktree');
```

## Configuration

Environment variables:
- `FACTORIAL_OBSERVABILITY_ENABLED`: Enable observability integration
- `FACTORIAL_OBSERVABILITY_BASE_PORT`: Base port for observability services (default: 9428)

## Resource Limits

Default per-worktree allocation:
- Vector: 128MB RAM
- Victoria Logs: 512MB RAM, 1GB storage
- Victoria Metrics: 256MB RAM, 512MB storage
- Victoria Traces: 512MB RAM, 1GB storage

Total: ~1.4GB RAM, ~2.5GB storage per worktree

## High-Risk Invariants

| ID | Invariant | Status |
|----|-----------|--------|
| OBS-001 | Complete isolation between worktrees | Enforced |
| OBS-002 | Automatic resource cleanup | Enforced |
| OBS-003 | Deterministic query results | Enforced |
| OBS-004 | Resource limits (1.4GB max per stack) | Configured |
| OBS-005 | No cross-worktree data leakage | Enforced |
| OBS-006 | Graceful degradation when stack unavailable | Implemented |

## Security

- Automatic redaction of secrets in logs (API keys, tokens, passwords)
- Worktree-scoped data isolation
- No persistent storage of sensitive data
- Local-only stack (no external network exposure)

## Troubleshooting

### Stack fails to start

1. Check Docker is running: `docker --version`
2. Check port availability: `lsof -i :9428`
3. Check disk space: `df -h`

### Query returns no results

1. Verify stack is running: `factorial observability:status`
2. Check time range in query
3. Verify worktree ID matches

### High memory usage

1. Reduce retention period: Set `retentionPeriod: '1d'`
2. Lower storage limits
3. Run fewer concurrent worktrees

## Roadmap

- Phase 3: DTU integration with trace assertions
- Phase 4: Production Victoria clustering
- Phase 5: OTLP export for external systems
