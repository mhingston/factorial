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
- Declared current level: `provider-backed`
- Declared next level: `autonomous`
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

## Required Criteria for Next Level (`autonomous`)
Promotion from `provider-backed` to `autonomous` requires:
1. `AU-001` = `pass` (published autonomous stability/guardrail report)
2. `AU-002` = `pass` (published agent-audit evidence report)

## CI/Reporting Hooks
- CI job: `.github/workflows/ci.yml` -> `self-host-maturity`
- Required gate in CI: `--require-level deterministic-local`
- Deterministic flake stability gate: `.github/workflows/ci.yml` -> `self-host-flake` (`self_host_flake_report.v1`)
- Provider-backed live-canary lane (configured/secret-gated): `.github/workflows/provider-backed-live-canary.yml` (fail-closed with `--require-pass` when provider secrets are configured)
- Recommended freshness expectation for live-canary provider-backed evidence: <= 168 hours
- Recommended periodic publication target for next-level evidence:
  - `docs/metrics/reports/self-host-flake-latest.json`
  - `docs/metrics/reports/self-host-provider-backed-latest.json`
  - `docs/metrics/reports/self-host-provider-backed-live-latest.json`
  - `docs/metrics/reports/self-host-autonomous-latest.json`
  - `docs/metrics/reports/self-host-agent-audit-latest.json`
