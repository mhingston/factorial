# Self-hosting Maturity Ladder

Last updated: 2026-02-12

This document defines staged self-hosting maturity levels and objective promotion gates for repository claims.

## Levels
| level | declaration | promotion gate policy |
| --- | --- | --- |
| `deterministic-local` | Self-host loop behavior is deterministic in local/CI execution and lock-decision controls are enforced. | All `DL-*` gates must be `pass`. |
| `provider-backed` | Deterministic-local guarantees are preserved and provider-backed parity/evidence is published. | All `DL-*` and `PB-*` gates must be `pass`. |
| `autonomous` | Provider-backed guarantees are preserved and autonomous operation evidence/guardrails are published. | All `DL-*`, `PB-*`, and `AU-*` gates must be `pass`. |

## Gate Catalog
| gate_id | level | objective requirement | evaluation hook |
| --- | --- | --- | --- |
| `DL-001` | `deterministic-local` | Self-host dogfood report proves `resolved` path passes and `reopen` path fails with lock enforcement. | `npm run self-host:maturity` (runs `scripts/self-host-dogfood.js`) |
| `DL-002` | `deterministic-local` | Promotion/profile governance accepts valid regulated workflow and rejects weak prod profile (`QUALITY_PROFILE_TOO_WEAK_FOR_STAGE`). | `npm run self-host:maturity` (runs `factorial validate` checks) |
| `DL-003` | `deterministic-local` | Compound lock policy check passes compliant PR fixture and fails missing-lock fixture. | `npm run self-host:maturity` (runs `scripts/check-pr-compound-artifacts.js`) |
| `PB-001` | `provider-backed` | Published provider-backed report confirms parity contract tests passed. | Presence and schema fields in `docs/metrics/reports/self-host-provider-backed-latest.json` |
| `PB-002` | `provider-backed` | Published provider-backed self-host report exists and confirms pass for `openai` + `anthropic`. | Presence and schema of `docs/metrics/reports/self-host-provider-backed-latest.json` |
| `PB-LIVE-01` | `provider-backed` | Supplemental bounded live-provider probe evidence is published for `openai` + `anthropic` with explicit timeout/token limits. | Presence and schema of `docs/metrics/reports/self-host-provider-backed-live-latest.json` (`self_host_provider_backed_live_report.v1`) |
| `AU-001` | `autonomous` | Published autonomous stability/guardrail report exists and all required summary checks pass. | Presence and schema of `docs/metrics/reports/self-host-autonomous-latest.json` |
| `AU-002` | `autonomous` | Published agent-audit evidence artifact exists with required schema. | Presence and schema of `docs/metrics/reports/self-host-agent-audit-latest.json` |

## Current Declaration
- Declared current level: `autonomous`
- Declared next level: `full-autonomy`
- Objective assessment command:

```bash
npm run self-host:maturity -- --require-level deterministic-local
```

The command writes:
- JSON report: `<logs_root>/report.json` (`self_host_maturity_report.v1`)
- Markdown report: `<logs_root>/report.md`
- Provider-backed evidence publication command:

```bash
npm run self-host:provider-backed
```

- Provider-backed live-canary evidence publication command (advisory by default):

```bash
npm run self-host:provider-backed-live -- --report ./docs/metrics/reports/self-host-provider-backed-live-latest.json
```

- Provider-backed live-canary fail-closed mode (configured nightly/release lanes):

```bash
npm run self-host:provider-backed-live -- --require-pass --report ./docs/metrics/reports/self-host-provider-backed-live-latest.json
```

- Autonomous evidence publication command:

```bash
npm run self-host:autonomous
```

- Agent-audit evidence publication command:

```bash
npm run self-host:agent-audit
```

## Required Criteria for Next Level (`full-autonomy`)

Promotion from `autonomous` to `full-autonomy` requires expanding operational boundaries beyond current unattended constraints while maintaining zero-human-intervention guarantees for defined workflow categories.

### Level Definition
| level | declaration | promotion gate policy |
| --- | --- | --- |
| `full-autonomy` | Zero-human-intervention execution across external systems with self-modification, multi-instance coordination, and autonomous optimization capabilities. | All `DL-*`, `PB-*`, `AU-*`, and `FA-*` gates must be `pass`. |

### Full-Autonomy Gate Catalog

**Boundary Expansion (External Systems)**
| gate_id | level | objective requirement | evaluation hook |
| --- | --- | --- | --- |
| `FA-001` | `full-autonomy` | Published external-system integration report validates safe operation across third-party APIs (webhooks, databases, cloud services) with deterministic rollback and audit trails. | Presence and schema of `docs/metrics/reports/external-system-operations-latest.json` |
| `FA-002` | `full-autonomy` | External operation circuit-breaker patterns are enforced with automatic degradation and human-escalation triggers for anomaly detection. | `npm run self-host:circuit-breaker-test` (publishes `circuit-breaker-tuning-latest.json`) |

**Self-Modification Capabilities**
| gate_id | level | objective requirement | evaluation hook |
| --- | --- | --- | --- |
| `FA-003` | `full-autonomy` | Self-modification report proves Factorial can generate, validate, and apply DOT graph modifications autonomously with pre-flight lint and deterministic outcome verification. | Presence and schema of `docs/metrics/reports/self-modification-latest.json` |
| `FA-004` | `full-autonomy` | Configuration optimization report demonstrates autonomous parameter tuning (confidence thresholds, retry policies, budget limits) based on historical run analytics with bounded drift limits. | `npm run self-host:optimize -- --report ./docs/metrics/reports/config-optimization-latest.json` |
| `FA-005` | `full-autonomy` | Code generation report validates autonomous handler/schema generation with golden test regression coverage. | `npm run self-host:codegen-validation` |

**Multi-Instance Coordination**
| gate_id | level | objective requirement | evaluation hook |
| --- | --- | --- | --- |
| `FA-006` | `full-autonomy` | Distributed execution report proves cross-instance workflow orchestration with consensus protocols and split-brain detection. | Presence and schema of `docs/metrics/reports/distributed-consensus-latest.json` |
| `FA-007` | `full-autonomy` | Cross-repository workflow report validates multi-repo coordination with dependency tracking and transitive lock propagation. | `npm run self-host:cross-repo-test` |

**Zero-Human-Intervention Execution**
| gate_id | level | objective requirement | evaluation hook |
| --- | --- | --- | --- |
| `FA-008` | `full-autonomy` | Unattended telemetry report shows 30-day zero-escalation operation for defined workflow categories with explicit categorization and out-of-distribution detection. | Presence and schema of `docs/metrics/reports/full-autonomy-telemetry-latest.json` |
| `FA-009` | `full-autonomy` | Self-healing report demonstrates autonomous error recovery (not just retry) including state reconstruction, alternative path selection, and graceful degradation without human input. | `npm run self-host:self-healing` |

### Evidence Publication Commands

```bash
# FA-001: External system operations validation
npm run self-host:external-systems -- --report ./docs/metrics/reports/external-system-operations-latest.json

# FA-002: Circuit breaker test with automatic degradation
npm run self-host:circuit-breaker-test -- --report ./docs/metrics/reports/circuit-breaker-tuning-latest.json

# Self-modification capability demonstration
npm run self-host:self-mod -- --report ./docs/metrics/reports/self-modification-latest.json

# Configuration optimization evidence
npm run self-host:optimize -- --report ./docs/metrics/reports/config-optimization-latest.json

# Codegen validation evidence
npm run self-host:codegen-validation -- --report ./docs/metrics/reports/codegen-validation-latest.json

# Distributed execution validation
npm run self-host:distributed -- --consensus-report ./docs/metrics/reports/distributed-consensus-latest.json

# Cross-repo workflow validation
npm run self-host:cross-repo-test -- --report ./docs/metrics/reports/cross-repo-coordination-latest.json

# Full autonomy telemetry aggregation
npm run self-host:full-autonomy-telemetry -- --report ./docs/metrics/reports/full-autonomy-telemetry-latest.json

# Self-healing validation
npm run self-host:self-healing -- --report ./docs/metrics/reports/self-healing-latest.json

# Full autonomy readiness rollup
npm run full-autonomy:readiness -- --report ./docs/metrics/reports/full-autonomy-readiness-latest.json
```

### Current Status
- Declared current level: `autonomous`  
- Declared next level: `full-autonomy`
- Required gates for promotion: `FA-001` through `FA-009`
- Status: 
  - ✅ `FA-001` implemented: External system operations with circuit breakers and deterministic rollback
  - ✅ `FA-002` implemented: Circuit breaker automatic degradation and human escalation triggers
  - ✅ `FA-003` implemented: DOT generation with pre-flight lint and rollback
  - ✅ `FA-004` implemented: Configuration optimization with bounded drift
  - ✅ `FA-005` implemented: Handler/schema codegen validation with golden fixtures
  - ✅ `FA-006` implemented: Distributed execution consensus + split-brain detection
  - ✅ `FA-007` implemented: Cross-repo lock propagation + cycle detection
  - ✅ `FA-008` implemented: Full autonomy telemetry report with zero-escalation + OOD checks
  - ✅ `FA-009` implemented: Self-healing report with root-cause + alternative path evidence

The `autonomous` level requires (currently satisfied):
- `AU-001` = `pass` (published autonomous stability/guardrail report)
- `AU-002` = `pass` (published agent-audit evidence report)

## CI/Reporting Hooks
- CI job: `.github/workflows/ci.yml` -> `self-host-maturity`
- Required gate in CI: `--require-level deterministic-local`
- Deterministic flake stability gate: `.github/workflows/ci.yml` -> `self-host-flake` (`self_host_flake_report.v1`)
- Provider-backed live-canary lane (configured/secret-gated): `.github/workflows/provider-backed-live-canary.yml` (fail-closed with `--require-pass` when provider secrets are configured)
- Recommended freshness expectation for live-canary provider-backed evidence: <= 168 hours
- Recommended periodic publication target for next-level evidence:
  - `docs/metrics/reports/full-autonomy-readiness-latest.json`
  - `docs/metrics/reports/self-host-flake-latest.json`
  - `docs/metrics/reports/self-host-provider-backed-latest.json`
  - `docs/metrics/reports/self-host-provider-backed-live-latest.json`
  - `docs/metrics/reports/self-host-autonomous-latest.json`
  - `docs/metrics/reports/self-host-agent-audit-latest.json`
