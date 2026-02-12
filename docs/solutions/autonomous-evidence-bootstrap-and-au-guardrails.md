---
title: "Autonomous evidence bootstrap and AU guardrails"
category: "reliability"
tags:
  - "self-host-maturity"
  - "autonomous-guardrails"
date: "2026-02-12"
trigger: "BK-012 required deterministic autonomous/agent-audit evidence publication and strict AU gate contract validation."
---

# Problem
`AU-001` and `AU-002` were declared in maturity policy but lacked deterministic publisher commands and strict artifact contract verification. This left autonomous guardrail claims partially manual and under-specified.

# Solution Pattern
Introduce deterministic autonomous and agent-audit report publishers, then make maturity gates consume those published artifacts with strict schema checks and explicit human-free guardrail assertions.

# Key Insight
Promotion gates stay trustworthy when publication and verification are separated: one command publishes deterministic evidence; another command evaluates objective schema/status contracts.

# Implementation References
- Files touched:
  - `scripts/self-host-autonomous-report.js`
  - `scripts/self-host-agent-audit-report.js`
  - `scripts/self-host-maturity.js`
  - `package.json`
  - `packages/cli/src/self-host-autonomous-report.test.ts`
  - `packages/cli/src/self-host-agent-audit-report.test.ts`
  - `packages/cli/src/self-host-maturity.test.ts`
  - `docs/self-hosting-maturity-ladder.md`
  - `docs/companion-spec-scope-contract.md`
  - `docs/spec-conformance-matrix.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/self-host-autonomous-report.test.ts`
  - `packages/cli/src/self-host-agent-audit-report.test.ts`
  - `packages/cli/src/self-host-maturity.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-plan.md`
  - `docs/reviews/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `self_host_autonomous_report.v1` and `self_host_agent_audit_report.v1` publish deterministic pass/fail summaries and check-level evidence.
  - `self-host:maturity` `AU-001`/`AU-002` gates now strictly validate published report schemas/keys and no longer rely on placeholder logic.
- What validated reliability over time:
  - `npm run self-host:autonomous -- --report ./docs/metrics/reports/self-host-autonomous-latest.json`
  - `npm run self-host:agent-audit -- --report ./docs/metrics/reports/self-host-agent-audit-latest.json`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`
  - `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not required for BK-012 batch 1; this batch adds issue-scoped command/report contracts and does not introduce a new default reusable agent-process rule.

# Reuse Guidance
- When to apply this pattern:
  - Any maturity/promotion gate that requires objective published evidence and strict fail-closed validation.
- When not to apply:
  - Cases where the repository intentionally allows non-deterministic/ad-hoc evidence without contract enforcement.
- Known tradeoffs:
  - Additional report generation commands increase maintenance surface and require report schema/version discipline.
