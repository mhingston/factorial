# Plan: BK-014 Provider-Backed Live-Canary Evidence Hardening (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-014`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - Provider-backed evidence uses deterministic contract-test publication (`self_host_provider_backed_report.v1`) only.
  - There is no bounded live-provider probe report contract for `openai` + `anthropic`.
  - CI has no explicit optional/fail-closed lane for live provider canary evidence.
- Target behavior:
  - Add deterministic live-canary report command publishing `self_host_provider_backed_live_report.v1` for minimal bounded probes of required providers (`openai`, `anthropic`) with strict timeout/cost controls.
  - Keep local/default usage optional (non-blocking advisory), and fail closed only when explicitly configured.
  - Add explicit release/nightly-style canary lane with fail-closed behavior only when provider secrets are configured.
  - Publish and reference `docs/metrics/reports/self-host-provider-backed-live-latest.json` in maturity/roadmap docs with freshness expectations.
- Why this change is needed:
  - `BK-014` is next in execution order and is required to strengthen provider-backed claims beyond deterministic contract tests while preserving deterministic-local CI floor.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| BK-014 scope definition | `ROADMAP.md` | Requires bounded live probe report command, optional local behavior, explicit fail-closed configured lane, and docs references | Implementation must satisfy all listed required-scope bullets |
| Existing provider-backed evidence command | `scripts/self-host-provider-backed-report.js`, `packages/cli/src/self-host-provider-backed-report.test.ts` | Publishes deterministic provider-backed contract-test report (`PB-001`/`PB-002`) | Reuse publication/report pattern for live canary |
| Maturity references | `docs/self-hosting-maturity-ladder.md`, `scripts/self-host-maturity.js` | Documents provider-backed evidence and deterministic-local CI floor; no live-canary evidence reference | Keep deterministic-local floor unchanged |
| CI gate patterns | `.github/workflows/ci.yml` | Has fail-closed deterministic gates and artifact uploads | Add explicitly configured live-canary lane without breaking default deterministic CI |

## External Constraints
- API/provider constraints:
  - Live canary must support missing provider keys/package availability without failing default local advisory mode.
- Runtime/environment constraints:
  - Probe must enforce strict timeout and bounded token/cost limits.
  - Tests must be deterministic and not require network/provider credentials.
- Backward compatibility constraints:
  - Do not weaken `deterministic-local` CI floor.
  - Existing provider-backed contract-test command and maturity gate behavior remain intact.

## Design Outline
- Proposed approach:
  - Add `scripts/self-host-provider-backed-live-report.js` with:
    - report schema `self_host_provider_backed_live_report.v1`,
    - bounded provider probes (`openai`, `anthropic`) with max timeout + max token limits,
    - advisory mode (default) vs fail-closed mode (`--require-pass`),
    - deterministic summary/check contracts and explicit provider statuses (`pass|fail|skip`).
  - Add npm command `self-host:provider-backed-live`.
  - Add deterministic regression tests using mock probe mode (pass/fail/skip) in `packages/cli/src/self-host-provider-backed-live-report.test.ts`.
  - Add optional configured live-canary workflow (`.github/workflows/provider-backed-live-canary.yml`) that fails closed only when required provider secrets are present.
  - Publish latest report under `docs/metrics/reports/self-host-provider-backed-live-latest.json`.
  - Update README, self-host maturity ladder, spec matrix, and roadmap references for live-canary evidence/freshness expectations.
- Rejected alternatives and why:
  - Making live canary mandatory in default CI: rejected because BK-014 explicitly requires preserving deterministic-local CI floor and optional local path.
  - Using unbounded provider prompts/usage: rejected due to timeout/cost risk and non-deterministic probe behavior.
- Affected interfaces and contracts:
  - New command: `npm run self-host:provider-backed-live`.
  - New report schema: `self_host_provider_backed_live_report.v1`.
  - New optional configured workflow: provider-backed live canary lane.

## Edge Cases
- Edge case 1:
  - Provider secrets are missing in local/dev or CI contexts.
- Edge case 2:
  - Provider package is unavailable or provider response exceeds timeout/token bounds.
- Failure mode handling:
  - Report records explicit `pass|fail|skip` per provider with details and policy mode.
  - Command exits non-zero only in explicit fail-closed mode (`--require-pass`) when required providers are not pass.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK014-INV-01 | Live canary probes are bounded for timeout/cost | Enforce strict timeout and max token thresholds in live probe path | live-report tests + command output details |
| BK014-INV-02 | Default deterministic CI floor remains unchanged | Keep live-canary fail-closed behavior opt-in/configured only | full verification suite + CI workflow conditions |
| BK014-INV-03 | Required providers are explicit and auditable | Report summary/checks include `openai` + `anthropic` statuses and required provider set | schema test + published report evidence |
| BK014-INV-04 | Fail-closed behavior is explicit and reproducible | `--require-pass` mode exits non-zero when required provider status is not `pass` | fail-mode regression test + configured workflow |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK014-01` Add deterministic provider-backed live-canary report command/schema with bounded `openai`/`anthropic` probe controls.
  - `BK014-02` Add deterministic pass/fail/skip regression coverage for live-canary report behavior.
  - `BK014-03` Add explicitly configured fail-closed live-canary workflow lane without weakening deterministic-local CI floor.
  - `BK014-04` Converge docs/roadmap/process artifacts and publish latest live-canary evidence reference.
- Implementer scope statement (batch-limited):
  - Implement only `BK014-01` through `BK014-04`.
- Verifier scope statement (batch-only):
  - Verify only `BK014-01` through `BK014-04` with pass/fail evidence; do not introduce new issue IDs.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
