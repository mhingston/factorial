# Backlog BK-012 Autonomous Evidence Bootstrap and AU Guardrails Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-012` (Autonomous evidence bootstrap and `AU-*` guardrails)

## Implemented Capabilities
1. Deterministic autonomous evidence publication
- Added deterministic autonomous evidence publisher command:
  - `npm run self-host:autonomous`
- Added script:
  - `scripts/self-host-autonomous-report.js`
- Publishes report artifact:
  - `docs/metrics/reports/self-host-autonomous-latest.json`
- Report contract schema:
  - `self_host_autonomous_report.v1`
- Includes explicit summary keys:
  - `summary.au001_status`
  - `summary.stability_pass`
  - `summary.guardrails_pass`
  - `summary.human_free_pass`
  - `summary.overall_status`

2. Deterministic agent-audit evidence publication path
- Added deterministic agent-audit evidence publisher command:
  - `npm run self-host:agent-audit`
- Added script:
  - `scripts/self-host-agent-audit-report.js`
- Publishes report artifact:
  - `docs/metrics/reports/self-host-agent-audit-latest.json`
- Report contract schema:
  - `self_host_agent_audit_report.v1`
- Publication is tied to existing `agent:audit` output contract and command execution path.

3. Strict AU gate validation in maturity evaluation
- Updated `scripts/self-host-maturity.js` to evaluate AU gates from published artifacts with strict schema validation:
  - `AU-001` validates `self_host_autonomous_report.v1` keys/status.
  - `AU-002` validates `self_host_agent_audit_report.v1` keys/status.
- Added explicit `--autonomous-report` and `--agent-audit-report` overrides for deterministic testing.

4. Human-free guardrail policy assertions
- Autonomous report now enforces explicit policy assertions that:
  - unattended external autonomy remains out-of-scope in companion-scope contract,
  - declared maturity remains staged (`provider-backed` current, `autonomous` next),
  - explicit human-free boundary wording remains present.

5. Documentation and process convergence
- Added BK-012 plan/review/solution artifacts.
- Updated roadmap and maturity/spec docs with autonomous and agent-audit publication commands and completion references.

## Validation Evidence
- `npm run self-host:autonomous -- --report ./docs/metrics/reports/self-host-autonomous-latest.json` -> PASS
- `npm run self-host:agent-audit -- --report ./docs/metrics/reports/self-host-agent-audit-latest.json` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS
- `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-plan.md`](../plans/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-plan.md)
- Review: [`docs/reviews/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-review.md`](../reviews/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-review.md)
- Solution: [`docs/solutions/autonomous-evidence-bootstrap-and-au-guardrails.md`](../solutions/autonomous-evidence-bootstrap-and-au-guardrails.md)

## Exit Criteria
- `AU-001` and `AU-002` gates are objectively verifiable from published deterministic artifacts with strict schema checks.
- Autonomous evidence publication paths are reproducible and fail closed on invalid/missing required contract fields.
- Human-free guardrail policy assertions are explicit and validated without introducing unattended external-system autonomy claims.
