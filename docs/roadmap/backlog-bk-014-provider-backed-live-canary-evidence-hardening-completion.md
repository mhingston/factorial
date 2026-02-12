# Backlog BK-014 Provider-Backed Live-Canary Evidence Hardening Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-014` (Provider-backed live-canary evidence hardening)

## Implemented Capabilities
1. Deterministic live-canary publication command/report
- Added command:
  - `npm run self-host:provider-backed-live`
- Added script:
  - `scripts/self-host-provider-backed-live-report.js`
- Added report schema:
  - `self_host_provider_backed_live_report.v1`
- Added latest artifact:
  - `docs/metrics/reports/self-host-provider-backed-live-latest.json`

2. Bounded provider probe controls
- Required providers:
  - `openai`, `anthropic`
- Enforced bounds:
  - probe timeout (`--timeout-ms`, bounded)
  - max output tokens (`--max-output-tokens`, bounded)
  - max total token budget check (`--max-total-tokens`, bounded)
- Provider statuses are explicit per report:
  - `pass|fail|skip`

3. Optional local mode + configured fail-closed mode
- Advisory mode (default):
  - records non-pass outcomes without fail-closing local/default usage.
- Fail-closed mode:
  - `--require-pass` exits non-zero unless all required providers are `pass`.

4. Configured live-canary lane
- Added workflow:
  - `.github/workflows/provider-backed-live-canary.yml`
- Behavior:
  - nightly + manual trigger lane
  - secret-gated execution (`OPENAI_API_KEY` + `ANTHROPIC_API_KEY`)
  - fail-closed command invocation with `--require-pass`

5. Docs/claim convergence
- Updated:
  - `docs/self-hosting-maturity-ladder.md` (live-canary evidence reference + freshness expectation)
  - `docs/spec-conformance-matrix.md` (CAL-DELTA-02 evidence map includes live canary lane)
  - `README.md` command references
  - `ROADMAP.md` BK-014 status/execution-order/process references

## Validation Evidence
- `npm run self-host:provider-backed-live -- --report ./docs/metrics/reports/self-host-provider-backed-live-latest.json` -> PASS
- `npm run test:run -- packages/cli/src/self-host-provider-backed-live-report.test.ts` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS
- `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-plan.md`](../plans/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-plan.md)
- Review: [`docs/reviews/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-review.md`](../reviews/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-review.md)
- Solution: [`docs/solutions/provider-backed-live-canary-evidence-hardening.md`](../solutions/provider-backed-live-canary-evidence-hardening.md)

## Exit Criteria
- Live-canary report publication is reproducible with explicit pass/fail/skip schema semantics and bounded probe controls.
- Provider-backed claims now reference both deterministic contract-test evidence and supplemental live-canary evidence with freshness expectations.
- Fail-closed enforcement occurs only in explicitly configured live-canary lane (`--require-pass` with secret-gated workflow).
