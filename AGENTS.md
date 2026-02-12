# AGENTS.md

## Project Overview
Factorial is a DOT-based workflow runner for multi-stage AI pipelines.
The system is core-preserving: reliability and operating model improvements should not rewrite the graph
execution engine.

## Stack
- TypeScript (Node.js, ESM)
- Vitest for tests
- Biome for linting
- Graph workflows defined in DOT

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

## Mandatory Engineering Loop (Feature Work)
1. Create a plan artifact from `docs/templates/plan.md`.
2. Implement changes scoped to selected issue IDs.
3. Produce structured review findings using `docs/templates/review.md`.
4. Synthesize a bounded issue batch (high-impact items only).
5. Verify selected issue IDs only, with `pass|fail` evidence per issue.
6. Apply consensus lock decision (`resolved` or `reopen`).
7. Record reusable learning in `docs/solutions/*.md` using `docs/templates/compound.md`.
8. Update this file when a new reusable pattern should become default guidance.

Ratchet rule: no new critique is added until the active batch reaches `resolved`.

## Conventions
- Keep changes deterministic and CI-friendly.
- Prefer strict schemas and explicit pass/fail routing for workflow quality controls.
- For PR-bound feature work, ensure the PR body passes `npm run check:pr-compound` (plan/review/compound links + lock decision + ratchet reference).
- Publish one weekly compound metrics report under `docs/metrics/reports/` using `npm run metrics:compound-weekly`.
- For reliability SLO claims, require `npm run reliability:slo` to publish `compound_reliability_slo_report.v1` and enforce fail-closed `consensus_lock_decision` (`resolved|reopen`) from explicit thresholds.
- For self-hosting maturity claims, keep `docs/self-hosting-maturity-ladder.md` current and require `npm run self-host:maturity -- --require-level deterministic-local` to stay green in CI.
- Current declared self-hosting level is `provider-backed`; keep `deterministic-local` as the CI floor and publish provider-backed evidence with `npm run self-host:provider-backed`.
- For deterministic verification hardening claims, require `npm run self-host:flake` to publish `self_host_flake_report.v1` and fail CI when required-suite replay pass-rate falls below threshold.
- For command-surface or backlog-direction documentation changes, require `npm run docs:freshness` to publish `docs_freshness_report.v1` and fail closed on drift.
- Keep `ROADMAP.md` compact by moving historical detail into `docs/roadmap/archive/` and updating `docs/roadmap/active-handoff.md` for active-session context.
- For CLI/e2e suites that invoke build + CLI commands, use deterministic shared prebuild and suite-scoped temp/log isolation helpers instead of per-suite ad-hoc build/temp wiring.
- For release hardening claims, require `npm run release:hardening` evidence artifacts (SBOM/signature/provenance policy checks) to pass in CI/release workflows.
- Current backlog direction is `none` (the active `BK-*` queue is empty in the current roadmap snapshot).
- Treat active `BK-*` items in `ROADMAP.md` as the execution scope; historical PRDs are reference context unless explicitly reactivated in the roadmap.
- For conformance/maturity claim changes, update `ROADMAP.md`, `docs/spec-conformance-matrix.md`, `docs/companion-spec-scope-contract.md`, and `docs/self-hosting-maturity-ladder.md` in the same batch.
- For new runtime adapters (including DTU work), define contract schema + in-memory boundary + fixture parity checks before adding external integration layers.
- For codergen/provider work, keep handler orchestration backend-agnostic by routing provider execution through `packages/core/src/llm/` adapter contracts (`complete`/`stream`).
- Use file and line references for review findings.
- Prioritize reliability, security, correctness, and major performance issues over style.

## Common Mistakes
- Introducing new findings during batch verification.
- Mixing in style-only feedback during convergence batches.
- Leaving high-risk changes without explicit invariants in the plan.
- Creating solution docs without linking affected files/tests and trigger context.
- Treating a historical PRD as active scope when roadmap handoff points elsewhere.
- Updating one claim document without synchronizing the related claim set.

## Reference Docs
- Active execution source of truth: `docs/roadmap/active-handoff.md` (compact start point) + `ROADMAP.md` (canonical status/board)
- Historical PRD (implemented baseline): `docs/plans/rmd-020-subagent-orchestration-prd.md`
- When to update this section:
  - Update "Active execution source of truth" whenever the primary planning/execution entrypoint changes.
  - Update "Historical PRD" only when a different PRD becomes the implemented baseline.
- Templates:
  - `docs/templates/plan.md`
  - `docs/templates/review.md`
  - `docs/templates/compound.md`
- Knowledge base:
  - `docs/solutions/README.md`
  - `docs/solutions/*.md`
- Metrics:
  - `docs/metrics/compound-rate.md`
