# Plan: RMD-030 DTU Validation Platform Completion

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-030` (`DTU-02`, `DTU-03` completion pass)
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - DTU Phase A foundations exist (contract + in-memory runtime + one reference twin).
  - Scenario harness, satisfaction reporting, and deterministic failure-mode coverage were not complete.
- Target behavior:
  - Two reference twins operational and parity-checked.
  - Scenario harness runs smoke/regression/holdout suites non-interactively.
  - Satisfaction report emits totals, pass rate, holdout rate, and drift deltas.
  - Deterministic failure simulation covers rate limit, auth failure, malformed payload, timeout, and partial outage.
- Why this change is needed:
  - Close `RMD-030` so DTU roadmap tasks can be removed from active backlog.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| DTU foundation | `packages/core/src/dtu/contracts.ts`, `packages/core/src/dtu/runtime.ts` | Contract + runtime exists for one twin | Extend with second twin + harness layer |
| CLI integration | `packages/cli/src/index.ts` | run/validate/resume/replay only | Add deterministic `dtu-run` command |
| CI validation | `.github/workflows/ci.yml` | lint/typecheck/test/golden/worktree | Add DTU scenario harness step |
| Roadmap status | `ROADMAP.md`, `docs/roadmap/0.3-digital-twin-universe-execution-plan.md` | DTU still marked in progress | Remove/close DTU tasks after validation |

## External Constraints
- API/provider constraints:
  - DTU twins remain in-memory behavior clones without live API calls.
- Runtime/environment constraints:
  - Must execute non-interactively in CI and local runs.
- Backward compatibility constraints:
  - Existing graph engine semantics unchanged.

## Design Outline
- Proposed approach:
  - Add second reference twin (`slack.channel`) with deterministic simulation knobs.
  - Add scenario harness module with fixture loading, suite filtering, parity satisfaction evaluation, drift delta calculation, and failure-mode coverage tracking.
  - Add `dtu-run` CLI command to produce report artifacts.
  - Add fixture corpus for smoke/regression/holdout and failure-mode coverage.
  - Update roadmap/docs; remove DTU tasks from active roadmap once tests pass.
- Rejected alternatives and why:
  - External service-backed simulation: rejected for deterministic CI requirement.
  - Embedding scenario harness logic in CLI only: rejected to preserve reusable core API.
- Affected interfaces and contracts:
  - `DtuScenarioFixture` and `DtuSatisfactionReport` contracts.
  - New reference twin runtime builder.

## Edge Cases
- Edge case 1:
  - Unknown scenario suite input in CLI options.
- Edge case 2:
  - Baseline report missing optional fields.
- Failure mode handling:
  - Harness reports unsatisfied scenarios; CLI exits non-zero unless `--allow-unsatisfied` is set.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| DTU-INV-010 | Scenario harness results are deterministic from fixture inputs | Twin runtime + fixture expectations use explicit timing/seed contracts | DTU scenario harness tests (`AT-03`/`AT-04`) |
| DTU-INV-011 | Failure-mode coverage includes declared catalog entries | Fixture corpus includes one scenario per failure mode | DTU scenario harness tests (`AT-05`) |
| DTU-INV-012 | DTU runs are non-interactive and CI-safe | Dedicated CLI command and CI workflow step | CLI e2e test + CI config update |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `DTU-02A` scenario harness and fixture schema
  - `DTU-02B` satisfaction report + drift deltas + holdout metrics
  - `DTU-03A` deterministic failure-mode simulation coverage
- Implementer scope statement (batch-limited):
  - Implement only `DTU-02A`, `DTU-02B`, and `DTU-03A` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `DTU-02A`, `DTU-02B`, and `DTU-03A` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.

## Cross References
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- DTU execution plan: [`docs/roadmap/0.3-digital-twin-universe-execution-plan.md`](../roadmap/0.3-digital-twin-universe-execution-plan.md)
