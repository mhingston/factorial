# Roadmap

Last updated: 2026-02-11

## Current Direction
- Keep the core graph execution model stable.
- Improve reliability through deterministic contracts, quality gates, and golden regression coverage.
- Improve engineering throughput with a repository-native Plan -> Work -> Review -> Compound loop.
- Add scenario-driven validation at scale via a Digital Twin Universe (DTU) for third-party dependency behavior.

Issue breakdown:
- 0.2.x prioritized issues: [`docs/roadmap/0.2-prioritized-issues.md`](./docs/roadmap/0.2-prioritized-issues.md)
- 0.3.x DTU execution plan: [`docs/roadmap/0.3-digital-twin-universe-execution-plan.md`](./docs/roadmap/0.3-digital-twin-universe-execution-plan.md)
- 0.3.x DTU completion report: [`docs/roadmap/0.3-dtu-validation-platform-completion.md`](./docs/roadmap/0.3-dtu-validation-platform-completion.md)

## Status Snapshot (2026-02-11)
| Item | Milestone | Status | Notes |
| --- | --- | --- | --- |
| `RMD-020` / `PKG-020C` | 0.2.x | In progress | Batch 1+2 implemented; `test:worktree` executed on 2026-02-11 and skipped in this checkout due no resolvable `HEAD` (merge-prep verification pending commit-backed checkout). |
| `RMD-021` | 0.2.x | In progress | Worktree parity script now has strict CI no-skip mode, dependency bootstrap in detached worktree, and local clean-checkout guardrails. |
| `RMD-022` / `PKG-022A` | 0.2.x | In progress | CI PR-body compliance gate, weekly report generator, and 4-week report set implemented in branch. |
| `RMD-030` | 0.3.x | Done | DTU validation platform completed; see completion report. |
| `RMD-031` / `PKG-031A` | 0.3.x | Planned | Unified LLM adapter foundation for provider-aligned codergen convergence. |
| `RMD-032` | 0.3.x | Planned | Judge/evaluator maturity and score explainability. |
| `RMD-033` | 0.3.x | Planned | Targeted retry and failure taxonomy hardening. |
| `RMD-034` | 0.3.x | Planned | Promotion and governance profile enforcement. |

Active execution artifacts:
- `PKG-020C` batch 1 plan: [`docs/plans/pkg-020c-spec-conformance-batch-1-plan.md`](./docs/plans/pkg-020c-spec-conformance-batch-1-plan.md)
- `PKG-020C` batch 1 review: [`docs/reviews/pkg-020c-spec-conformance-batch-1-review.md`](./docs/reviews/pkg-020c-spec-conformance-batch-1-review.md)
- `PKG-020C` batch 2 plan: [`docs/plans/pkg-020c-spec-conformance-batch-2-plan.md`](./docs/plans/pkg-020c-spec-conformance-batch-2-plan.md)
- `PKG-020C` batch 2 review: [`docs/reviews/pkg-020c-spec-conformance-batch-2-review.md`](./docs/reviews/pkg-020c-spec-conformance-batch-2-review.md)
- `RMD-021` batch 1 plan: [`docs/plans/rmd-021-worktree-parity-batch-1-plan.md`](./docs/plans/rmd-021-worktree-parity-batch-1-plan.md)
- `RMD-021` batch 1 review: [`docs/reviews/rmd-021-worktree-parity-batch-1-review.md`](./docs/reviews/rmd-021-worktree-parity-batch-1-review.md)
- `RMD-021` handoff seed: [`docs/plans/rmd-021-subagent-handoff-batch-1.md`](./docs/plans/rmd-021-subagent-handoff-batch-1.md)
- `RMD-022` batch 1 plan: [`docs/plans/rmd-022-compound-enforcement-batch-1-plan.md`](./docs/plans/rmd-022-compound-enforcement-batch-1-plan.md)
- `RMD-022` batch 1 review: [`docs/reviews/rmd-022-compound-enforcement-batch-1-review.md`](./docs/reviews/rmd-022-compound-enforcement-batch-1-review.md)
- `RMD-031` handoff seed: [`docs/plans/rmd-031-subagent-handoff-batch-1.md`](./docs/plans/rmd-031-subagent-handoff-batch-1.md)

## Agent Session Handoff (Execution-Ready)
Use this section as the default starting point for a new coding agent session.

Execution order (do not reorder unless blocked):
1. `PKG-020C` (`RMD-020`): Attractor spec conformance hardening
2. `PKG-022A` (`RMD-022`): Compound loop enforcement automation
3. `PKG-031A` (`RMD-031`): Unified LLM adapter foundation

### PKG-020C: Attractor spec conformance hardening (0.2.x)
- Goal:
  - Close concrete spec deltas before adding new orchestration complexity.
- Why now:
  - Current behavior diverges from the referenced Attractor spec in parser/engine semantics.
- Required scope:
  - Enforce `digraph`-only parsing (reject undirected/`graph` mode).
  - Enforce exactly one exit node in lint (not "at least one").
  - Implement true `loop_restart` run boundary semantics (fresh run context/log root segment), not in-run continuation.
  - Complete `stack.manager_loop` Phase C by adding optional local child execution adapter hook.
- Implementation guidance:
  - Parser:
    - `packages/dot-parser/src/dot.pegjs`
    - `packages/dot-parser/src/parser-wrapper.ts`
    - `packages/dot-parser/src/parser-wrapper.test.ts`
  - Lint rules:
    - `packages/core/src/lint/index.ts`
    - `packages/core/src/lint/index.test.ts`
  - Runtime restart semantics:
    - `packages/core/src/engine/index.ts`
    - `packages/core/src/engine/cancellation.test.ts`
    - `packages/core/src/engine/resume.test.ts`
  - Manager loop Phase C:
    - `packages/core/src/handlers/builtin.ts`
    - `packages/core/src/handlers/builtin.test.ts`
    - `docs/plans/rmd-020-subagent-orchestration-prd.md` (status update)
    - `README.md` (behavior notes)
- Validation checklist:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run test:worktree` (must run in a checkout with resolvable `HEAD`)
- Exit criteria:
  - Spec-delta tests pass and are merged into golden/engine suites.
  - `loop_restart` behavior is deterministic and documented.
  - Manager loop can optionally execute delegated child workflows via adapter hook.

### PKG-022A: Compound loop enforcement automation (0.2.x)
- Goal:
  - Convert process guidance into enforced CI policy.
- Why now:
  - Templates/checklists exist, but merge gating for Plan/Review/Compound evidence is not automated.
- Required scope:
  - Add CI gate validating PR description includes:
    - Plan artifact link
    - Structured review artifact link
    - Compound artifact link (or explicit `N/A` reason)
    - Consensus lock decision (`resolved|reopen`)
  - Add weekly metrics reporting routine for 4 consecutive weeks.
  - Keep ratchet rule explicit in contributor-facing checks.
- Implementation guidance:
  - CI/workflows:
    - `.github/workflows/ci.yml`
    - add `scripts/check-pr-compound-artifacts.js` (or equivalent)
  - PR ergonomics:
    - `.github/pull_request_template.md`
  - Metrics/reporting:
    - `docs/metrics/compound-rate.md`
    - optionally add `scripts/compound-weekly-report.js`
    - store reports under `docs/metrics/reports/` (new folder)
  - Docs:
    - `README.md`
    - `AGENTS.md` (if new default pattern is introduced)
- Validation checklist:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - Run compliance script locally against sample PR body fixture(s)
- Exit criteria:
  - CI fails when required artifact links/lock decision are missing.
  - Weekly metric report format is standardized and reproducible from repository artifacts.
  - 4 weekly reports are linked from roadmap/status updates.

### PKG-031A: Unified LLM adapter foundation (0.3.x)
- Goal:
  - Introduce provider-aligned abstraction that keeps orchestration backend-agnostic.
- Why now:
  - Existing codergen path is functional but tightly coupled; multi-provider parity and richer telemetry need a formal adapter contract.
- Required scope:
  - Add a minimal adapter interface modeled on unified spec concepts:
    - `complete()`
    - `stream()` (can start as stub/unimplemented with explicit error)
  - Route codergen calls through this adapter boundary.
  - Preserve existing `api` and `cli` behavior while normalizing outputs.
  - Extend manifest/provenance fields for:
    - usage
    - cost
    - reasoning/tool metadata where available
- Implementation guidance:
  - Core contract and adapter registry:
    - `packages/core/src/types/index.ts`
    - add new module under `packages/core/src/llm/`
  - Codergen integration:
    - `packages/core/src/handlers/builtin.ts`
    - `packages/core/src/handlers/codergen.test.ts`
  - Manifest/provenance:
    - `packages/cli/src/index.ts`
    - `packages/cli/src/e2e-smoke.test.ts`
  - Golden/regression:
    - `tests/golden/workflows/*` and `tests/golden/expected/*` as needed
  - Documentation:
    - `README.md`
    - `docs/roadmap/0.3-digital-twin-universe-execution-plan.md` (phase status)
- Validation checklist:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
- Exit criteria:
  - Codergen execution path no longer depends on direct provider calls in handler logic.
  - Manifest includes stable provider-aligned provenance fields and tests assert shape.
  - At least one representative workflow passes with equivalent normalized outcome across 2 providers/backends.

### Session Rules for Any Agent Picking Up This Roadmap
- Before coding:
  - Create a plan artifact from `docs/templates/plan.md`.
  - Select bounded issue IDs (from package IDs/roadmap IDs above) and state in-scope IDs explicitly.
- During review convergence:
  - Use `docs/templates/review.md`.
  - No new critique during verification until consensus lock is `resolved`.
- Before merge:
  - Produce/update compound artifact from `docs/templates/compound.md`.
  - Add/update `docs/solutions/*.md` if a reusable pattern emerged.
  - Update `AGENTS.md` when a new pattern should become default guidance.

## Completed Foundation (0.1.x)
- [x] DOT parser + execution engine + CLI baseline.
- [x] CI baseline (lint, typecheck, tests, coverage gate).
- [x] Structured codergen contracts and schema-backed validation.
- [x] Golden regression harness for workflow behavior drift detection.
- [x] Agent operating scaffolding (`AGENTS.md`, templates, metrics, and `npm run agent:audit`).

## Completed Milestone Work (0.3.x)
- [x] RMD-030: Digital Twin Universe (DTU) validation platform
  - Implemented twin contracts + in-memory runtime boundary.
  - Added two reference twins (`jira.issue`, `slack.channel`) with deterministic parity fixtures.
  - Added non-interactive scenario harness with smoke/regression/holdout suites and satisfaction reporting.
  - Added deterministic failure simulation coverage (rate limit, auth failure, timeout, malformed payload, partial outage).
  - Completion artifact: [`docs/roadmap/0.3-dtu-validation-platform-completion.md`](./docs/roadmap/0.3-dtu-validation-platform-completion.md)

## Roadmap Board (Single Source of Truth)
### Now
| ID | Item | Status | Next execution focus |
| --- | --- | --- | --- |
| `RMD-020` | First-class subagent orchestration | In progress | `PKG-020C` deltas are implemented in branch; finalize in a checkout with resolvable `HEAD` so worktree parity can execute non-skip. |
| `RMD-021` | Git worktree compatibility guarantees | In progress | Strict CI parity enforcement and docs are in place; collect full pass evidence in a commit-backed checkout and merge. |
| `RMD-022` | Compound loop enforcement in contribution flow | In progress | CI artifact gate + weekly report generator + 4-week reports are in branch; verify in PR pipeline and merge. |

### Next
| ID | Item | Status | Exit criteria |
| --- | --- | --- | --- |
| `RMD-031` | Provider-aligned coding agent loop backend convergence | Planned | One representative workflow runs across >=2 providers with normalized manifest/provenance parity. |
| `RMD-032` | Judge/evaluator maturity | Planned | Rubric routing and explainability artifacts are deterministic and test-covered. |
| `RMD-033` | Targeted retry and failure taxonomy hardening | Planned | Failure classes and retry routing are explicit, measurable, and regression-covered. |
| `RMD-034` | Promotion and governance profiles | Planned | Promotion-stage policy checks are documented and enforced in CI. |

### Later
| ID | Item | Status | Notes |
| --- | --- | --- | --- |
| `BK-001` | Replay/provenance UX improvements | Backlog | Focus on incident debugging ergonomics after `RMD-031`/`RMD-034`. |
| `BK-002` | Confidence-based human escalation tuning | Backlog | Tune from production run data, not synthetic-only signals. |
| `BK-003` | Weekly compound metrics helper command | Backlog | Optional CLI/report helper once `RMD-022` policy is live. |

## External References
- DTU context: [factory.strongdm.ai](https://factory.strongdm.ai/)
- Attractor orchestration spec: [attractor-spec.md](https://github.com/strongdm/attractor/blob/main/attractor-spec.md)
- Coding agent loop spec: [coding-agent-loop-spec.md](https://github.com/strongdm/attractor/blob/main/coding-agent-loop-spec.md)
- Unified LLM client spec: [unified-llm-spec.md](https://github.com/strongdm/attractor/blob/main/unified-llm-spec.md)
