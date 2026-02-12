# AGENTS.md

## Core Commands
- `npm install`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:golden`
- `npm run agent:audit`
- `npm run check:pr-compound`
- `npm run metrics:compound-weekly -- --start YYYY-MM-DD --end YYYY-MM-DD`
- `npm run reliability:slo -- --report docs/metrics/reports/compound-reliability-slo-latest.json`
- `npm run self-host:maturity -- --require-level deterministic-local`
- `npm run self-host:provider-backed`
- `npm run self-host:flake -- --replay-count 2 --min-pass-rate 1 --report docs/metrics/reports/self-host-flake-latest.json`
- `npm run self-host:unattended-telemetry -- --source docs/metrics/reports/self-host-unattended-telemetry-source-latest.json --report docs/metrics/reports/self-host-unattended-telemetry-latest.json`
- `npm run docs:freshness -- --report logs/docs_freshness/report.json`
- `npm run release:hardening -- --strict-signing --signing-key-env RELEASE_SIGNING_KEY`

## Conventions
- Current backlog direction is `BK-016` (docs freshness guardrails); no additional `BK-*` items are queued after `BK-016` in the current roadmap snapshot.

## Reference Docs
- Active execution source of truth: `tests/fixtures/docs-freshness/HANDOFF.compliant.md`
