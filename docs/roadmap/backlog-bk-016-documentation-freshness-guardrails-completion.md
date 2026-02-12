# Backlog BK-016 Documentation Freshness Guardrails Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-016` (Documentation freshness guardrails)

## Implemented Capabilities
1. Deterministic docs freshness publication command/report
- Added command:
  - `npm run docs:freshness`
- Added script:
  - `scripts/docs-freshness-audit.js`
- Added report schema:
  - `docs_freshness_report.v1`
- Added latest artifact path:
  - `logs/docs_freshness/report.json` (local execution)

2. Required fail-closed drift checks
- Added deterministic check IDs:
  - `DF-001` required docs readable/parseable (`README.md`, `AGENTS.md`, `ROADMAP.md`, `package.json`)
  - `DF-002` AGENTS core command parity against `package.json` scripts + README command surface
  - `DF-003` roadmap freshness SLA from `Last updated: YYYY-MM-DD`
  - `DF-004` AGENTS backlog-direction IDs match ROADMAP `### Next` BK IDs
- Command exits non-zero when any required check fails.

3. Fixture-backed regression coverage
- Added script tests:
  - `packages/cli/src/docs-freshness-audit.test.ts`
- Added fixtures:
  - `tests/fixtures/docs-freshness/README.compliant.md`
  - `tests/fixtures/docs-freshness/README.missing-command.md`
  - `tests/fixtures/docs-freshness/AGENTS.compliant.md`
  - `tests/fixtures/docs-freshness/ROADMAP.compliant.md`
  - `tests/fixtures/docs-freshness/ROADMAP.stale.md`
  - `tests/fixtures/docs-freshness/package.compliant.json`

4. CI/reporting enforcement lane
- Added workflow job in `.github/workflows/ci.yml`:
  - `docs-freshness`
- Behavior:
  - runs docs freshness command in CI
  - fails closed on required-check drift
  - uploads report artifact from `logs/docs_freshness_ci/report.json`

5. Docs/process convergence
- Updated:
  - `package.json` command surface (`docs:freshness`)
  - `README.md` command reference
  - `AGENTS.md` core commands + docs-freshness convention
  - `ROADMAP.md` status snapshot, BK-016 section, board queue, and completion references

## Validation Evidence
- `npm run docs:freshness -- --report ./logs/docs_freshness/report.json --today 2026-02-12` -> PASS
- `npm run test:run -- packages/cli/src/docs-freshness-audit.test.ts` -> PASS
- `npm run typecheck` -> PASS
- `npm run lint` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-016-documentation-freshness-guardrails-batch-1-plan.md`](../plans/bk-016-documentation-freshness-guardrails-batch-1-plan.md)
- Review: [`docs/reviews/bk-016-documentation-freshness-guardrails-batch-1-review.md`](../reviews/bk-016-documentation-freshness-guardrails-batch-1-review.md)
- Solution: [`docs/solutions/documentation-freshness-guardrails-contract.md`](../solutions/documentation-freshness-guardrails-contract.md)

## Exit Criteria
- Docs freshness report is deterministic and machine-validated with fail-closed behavior.
- CI blocks merges when docs-freshness checks fail.
- AGENTS/README/ROADMAP references converge around enforceable docs freshness guidance.
