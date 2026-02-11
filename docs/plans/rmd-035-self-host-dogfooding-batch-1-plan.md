# Plan: RMD-035 Self-hosted Factory Dogfooding (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-035`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - No repository-native workflow that runs this project on itself to prove Plan -> Work -> Review -> Compound with lock decision enforcement.
- Target behavior:
  - Deterministic, CI-friendly script generates DOT workflow(s), runs `factorial run`, produces reproducible JSON evidence, and enforces manager lock: `resolved` passes, `reopen` fails.
- Why this change is needed:
  - Validates core engine via self-hosting and provides concrete evidence artifacts for roadmap closeout.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| CLI | packages/cli/src/index.ts | `run`, `validate`, `resume`, `replay`, `dtu-run` | Provides deterministic logs + manifest. |
| Handlers | packages/core/src/handlers/builtin.ts | `quality.gate`, `stack.manager_loop` | Manager loop fails when lock is `reopen` with no outgoing fail edge. |
| Tests | packages/cli/src/e2e-smoke.test.ts, tests/golden/* | e2e run + golden manager lock examples | Patterns reused for dogfood flows. |

## External Constraints
- Runtime: Node >= 20
- CI-deterministic: avoid API calls; use `llm_backend=cli` and trivial commands
- Backward compatibility: add-only changes; do not alter execution engine behavior

## Design Outline
- Add script `scripts/self-host-dogfood.js` to:
  - Build repo, generate two DOTs (resolved/reopen) including Plan/Work/Review/Compound stages.
  - Use a `codergen` stage that writes `{stage_dir}/status.json` with context updates for `stack.child.*` to control manager lock decision.
  - Run `factorial run` for each DOT with `--llm-backend cli` and write a deterministic `report.json` under the provided logs root.
  - Exit 0 only when resolved run passes and reopen run fails.
- Add npm script `dogfood:self-host` -> `node ./scripts/self-host-dogfood.js`.
- Tests: one e2e verifies report schema and pass/fail outcomes.

## Edge Cases
- Missing build artifacts -> script performs `npm run build` first.
- Non-UNIX shells -> use Node to spawn processes; avoid shell-specific syntax where possible.
- Paths with spaces -> quote DOT `cli_command` redirection targets.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| RMD-035-I1 | Reopen lock must fail | Manager node has only `resolved` edge; no fail edge | Report shows reopen exit code 1 and manifest outcome FAIL |
| RMD-035-I2 | Determinism of evidence | CLI backend only; fixed commands; JSON artifacts | Test asserts schema + statuses, not timestamps |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated (plan/review/solution/roadmap)

## Convergence Setup
- Initial issue batch target IDs: RMD-035A-01, RMD-035A-02
- Implementer scope statement (batch-limited): Add self-hosted dogfood runtime and tests only.
- Verifier scope statement (batch-only): Verify report JSON and lock enforcement evidence; no new findings outside batch.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
