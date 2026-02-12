# Plan: BK-018 Full Autonomy Production Evidence Collection

## Metadata
- Date: 2026-02-12
- Author: Agent
- Related issue/PR: BK-018 Full Autonomy Maturity
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior: FA-001 through FA-009 gates are implemented with synthetic test evidence, but lack production burn-in data showing real-world operation over extended periods
- Target behavior: Collect 30-day operational evidence demonstrating zero-escalation execution, self-healing recovery, and circuit breaker effectiveness in production scenarios
- Why this change is needed: To satisfy full-autonomy promotion criteria from `autonomous` to `full-autonomy` maturity level

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Full Autonomy Telemetry | `packages/core/src/dtu/full-autonomy-telemetry.ts` | Publishes telemetry reports with OOD detection | Needs production data collection hooks |
| Self-Healing | `packages/core/src/dtu/self-healing.ts` | Implements recovery patterns with alternative paths | Needs real error injection scenarios |
| Circuit Breakers | `packages/core/src/dtu/circuit-breaker.ts` | Half-open transitions and degradation | Needs threshold tuning from real metrics |
| Evidence Reports | `docs/metrics/reports/` | JSON report artifacts | Need automated 30-day aggregation |

## External Constraints
- API/provider constraints: Requires active API keys for live provider testing (OpenAI, Anthropic)
- Runtime/environment constraints: Needs CI scheduled runs or long-running process to collect 30-day data
- Backward compatibility constraints: Must maintain existing `autonomous` level guarantees

## Design Outline
- Proposed approach:
  1. Create a telemetry aggregation service that collects daily run outcomes
  2. Implement automated anomaly detection with configurable thresholds
  3. Build evidence aggregation command that produces 30-day reports
  4. Add scheduled CI workflow for nightly evidence collection
  5. Create dashboard for monitoring escalation rates and recovery patterns

- Rejected alternatives:
  - Manual 30-day observation (too slow, inconsistent)
  - Synthetic data generation (doesn't prove production readiness)

- Affected interfaces:
  - New CLI command: `factorial telemetry:aggregate`
  - New report schema: `full_autonomy_burn_in_report.v1`

## Edge Cases
- Edge case 1: Network failures during telemetry collection → Retry with exponential backoff
- Edge case 2: Missing data points (gaps in 30-day window) → Mark as insufficient samples
- Edge case 3: Provider API changes causing unexpected errors → OOD detection triggers human escalation
- Failure mode handling: All telemetry failures are logged but don't block workflow execution

## High-Risk Invariants
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-001 | Telemetry collection never blocks workflow execution | Async fire-and-forget with retry queue | Unit tests verify non-blocking behavior |
| INV-002 | 30-day evidence cannot be faked/synthesized | Cryptographic signatures from CI runner | Verify CI signature in report validation |
| INV-003 | Escalation events are immutable once recorded | Append-only log structure | Golden tests verify log immutability |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: BK-018-PROD-001 through BK-018-PROD-005
- Implementer scope statement: Production telemetry aggregation and evidence collection infrastructure
- Verifier scope statement: Verify evidence collection accuracy and report schema compliance
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
