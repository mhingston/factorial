# Roadmap

Last updated: 2026-02-11

## Current Direction
- Keep the core graph execution model stable.
- Improve reliability through deterministic contracts, quality gates, and golden regression coverage.
- Improve engineering throughput with a repository-native Plan -> Work -> Review -> Compound loop.
- Add scenario-driven validation at scale via a Digital Twin Universe (DTU) for third-party dependency behavior.

Issue breakdown:
- 0.2.x prioritized issues: [`docs/roadmap/0.2-prioritized-issues.md`](./docs/roadmap/0.2-prioritized-issues.md)
- 0.2.x core convergence completion report: [`docs/roadmap/0.2-core-convergence-completion.md`](./docs/roadmap/0.2-core-convergence-completion.md)
- 0.3.x DTU execution plan: [`docs/roadmap/0.3-digital-twin-universe-execution-plan.md`](./docs/roadmap/0.3-digital-twin-universe-execution-plan.md)
- 0.3.x DTU completion report: [`docs/roadmap/0.3-dtu-validation-platform-completion.md`](./docs/roadmap/0.3-dtu-validation-platform-completion.md)
- 0.3.x provider adapter completion report: [`docs/roadmap/0.3-provider-adapter-convergence-completion.md`](./docs/roadmap/0.3-provider-adapter-convergence-completion.md)
- 0.3.x self-hosted dogfooding completion report: [`docs/roadmap/0.3-self-hosted-factory-dogfooding-completion.md`](./docs/roadmap/0.3-self-hosted-factory-dogfooding-completion.md)

## Status Snapshot (2026-02-11)
| Item | Milestone | Status | Notes |
| --- | --- | --- | --- |
| `RMD-020` / `PKG-020C` | 0.2.x | Done | Finalization batch 1 completed on 2026-02-11; evidence recorded in this checkout. See completion report: [`docs/roadmap/0.2-core-convergence-completion.md`](./docs/roadmap/0.2-core-convergence-completion.md). |
| `RMD-021` | 0.2.x | Done | Worktree parity PASS captured in this checkout and documented; strict CI gating remains in place. See completion report: [`docs/roadmap/0.2-core-convergence-completion.md`](./docs/roadmap/0.2-core-convergence-completion.md). |
| `RMD-022` / `PKG-022A` | 0.2.x | Done | Compound PR-body compliance and weekly reporting finalized; verification evidence recorded. See completion report: [`docs/roadmap/0.2-core-convergence-completion.md`](./docs/roadmap/0.2-core-convergence-completion.md). |
| `RMD-030` | 0.3.x | Done | DTU validation platform completed; see completion report. |
| `RMD-031` / `PKG-031A` | 0.3.x | Done | Batch 1-3 complete: adapter boundary + provenance, implemented stream events, restored green baseline, and added deterministic two-provider parity evidence; see completion report. |
| `RMD-035` | 0.3.x | Done | Self-hosted factory dogfooding implemented with deterministic pass/fail lock enforcement report and tests; see completion report. |
| `RMD-032` | 0.3.x | Planned | Judge/evaluator maturity and score explainability. |
| `RMD-033` | 0.3.x | Planned | Targeted retry and failure taxonomy hardening. |
| `RMD-034` | 0.3.x | Planned | Promotion and governance profile enforcement. |

Design-review follow-up mapping (to avoid duplicate roadmap items):
- Finish adapter convergence + restore green `build/typecheck/test:run`: tracked under `RMD-031` (`PKG-031A`), no new item.
- Add formal spec-conformance matrix coverage: tracked under `RMD-020` (`PKG-020C`), no new item.
- Implement `LlmAdapter.stream()` and prove >=2-provider parity: tracked under `RMD-031`, no new item.
- Add repository dogfooding/self-host workflow: tracked under `RMD-035` and completed, no new item.

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
- `RMD-031` batch 1 plan: [`docs/plans/rmd-031-provider-adapter-batch-1-plan.md`](./docs/plans/rmd-031-provider-adapter-batch-1-plan.md)
- `RMD-031` batch 1 review: [`docs/reviews/rmd-031-provider-adapter-batch-1-review.md`](./docs/reviews/rmd-031-provider-adapter-batch-1-review.md)
- `RMD-031` batch 1 solution: [`docs/solutions/llm-adapter-boundary-and-provenance-normalization.md`](./docs/solutions/llm-adapter-boundary-and-provenance-normalization.md)
- `RMD-031` batch 2 plan: [`docs/plans/rmd-031-provider-adapter-batch-2-plan.md`](./docs/plans/rmd-031-provider-adapter-batch-2-plan.md)
- `RMD-031` batch 2 review: [`docs/reviews/rmd-031-provider-adapter-batch-2-review.md`](./docs/reviews/rmd-031-provider-adapter-batch-2-review.md)
- `RMD-031` batch 2 solution: [`docs/solutions/llm-stream-and-golden-duration-stability.md`](./docs/solutions/llm-stream-and-golden-duration-stability.md)
- `RMD-031` batch 3 plan: [`docs/plans/rmd-031-provider-adapter-batch-3-plan.md`](./docs/plans/rmd-031-provider-adapter-batch-3-plan.md)
- `RMD-031` batch 3 review: [`docs/reviews/rmd-031-provider-adapter-batch-3-review.md`](./docs/reviews/rmd-031-provider-adapter-batch-3-review.md)
- `RMD-031` batch 3 solution: [`docs/solutions/provider-parity-normalized-contract-tests.md`](./docs/solutions/provider-parity-normalized-contract-tests.md)
- `RMD-020/021/022` finalization batch plan: [`docs/plans/rmd-020-022-finalization-batch-1-plan.md`](./docs/plans/rmd-020-022-finalization-batch-1-plan.md)
- `RMD-020/021/022` finalization batch review: [`docs/reviews/rmd-020-022-finalization-batch-1-review.md`](./docs/reviews/rmd-020-022-finalization-batch-1-review.md)
- `RMD-020/021/022` finalization batch solution: [`docs/solutions/finalization-evidence-and-roadmap-closeout.md`](./docs/solutions/finalization-evidence-and-roadmap-closeout.md)
- `RMD-035` batch 1 plan: [`docs/plans/rmd-035-self-host-dogfooding-batch-1-plan.md`](./docs/plans/rmd-035-self-host-dogfooding-batch-1-plan.md)
- `RMD-035` batch 1 review: [`docs/reviews/rmd-035-self-host-dogfooding-batch-1-review.md`](./docs/reviews/rmd-035-self-host-dogfooding-batch-1-review.md)
- `RMD-035` batch 1 solution: [`docs/solutions/self-hosted-dogfood-loop-with-lock-enforcement.md`](./docs/solutions/self-hosted-dogfood-loop-with-lock-enforcement.md)

## Agent Session Handoff (Execution-Ready)
Use this section as the default starting point for a new coding agent session.

Execution order (do not reorder unless blocked):
1. `RMD-032`: Judge/evaluator maturity
2. `RMD-033`: Targeted retry and failure taxonomy hardening
3. `RMD-034`: Promotion and governance profiles

### PKG-020C: Attractor spec conformance hardening (0.2.x, completed)
- Status:
  - Closed on 2026-02-11; see [`docs/roadmap/0.2-core-convergence-completion.md`](./docs/roadmap/0.2-core-convergence-completion.md).
- Goal:
  - Close concrete spec deltas before adding new orchestration complexity.
- Why now:
  - Current behavior diverges from the referenced Attractor spec in parser/engine semantics.
- Required scope:
  - Enforce `digraph`-only parsing (reject undirected/`graph` mode).
  - Enforce exactly one exit node in lint (not "at least one").
  - Implement true `loop_restart` run boundary semantics (fresh run context/log root segment), not in-run continuation.
  - Complete `stack.manager_loop` Phase C by adding optional local child execution adapter hook.
  - Add an explicit spec-conformance matrix artifact (Attractor + coding-agent-loop + unified-llm deltas) with test coverage mapped to each active delta.
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
  - Spec-conformance matrix is committed and referenced from roadmap/review artifacts.

### PKG-022A: Compound loop enforcement automation (0.2.x, completed)
- Status:
  - Closed on 2026-02-11; see [`docs/roadmap/0.2-core-convergence-completion.md`](./docs/roadmap/0.2-core-convergence-completion.md).
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

### PKG-031A: Unified LLM adapter foundation (0.3.x, completed)
- Status:
  - Closed on 2026-02-11 with adapter boundary routing, stream implementation, and deterministic two-provider parity evidence.
- Completion artifact:
  - [`docs/roadmap/0.3-provider-adapter-convergence-completion.md`](./docs/roadmap/0.3-provider-adapter-convergence-completion.md)

### RMD-035: Self-hosted factory dogfooding (0.3.x, completed)
- Status:
  - Closed on 2026-02-11 with deterministic self-host loop evidence and lock decision enforcement.
- Completion artifact:
  - [`docs/roadmap/0.3-self-hosted-factory-dogfooding-completion.md`](./docs/roadmap/0.3-self-hosted-factory-dogfooding-completion.md)

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
- [x] RMD-031 / PKG-031A: Provider-aligned coding agent loop backend convergence
  - Routed codergen through adapter boundary and normalized provenance/usage metadata.
  - Implemented `LlmAdapter.stream()` with deterministic stream event contract coverage.
  - Added deterministic API parity evidence for equivalent normalized outcomes across `openai` + `anthropic`.
  - Completion artifact: [`docs/roadmap/0.3-provider-adapter-convergence-completion.md`](./docs/roadmap/0.3-provider-adapter-convergence-completion.md)
- [x] RMD-035: Self-hosted factory dogfooding
  - Added deterministic self-host workflow command (`npm run dogfood:self-host`) executing Plan -> Work -> Review -> Compound plus lock enforcement.
  - Produces reproducible report artifact with `resolved` pass and `reopen` fail expectations.
  - Added automated regression coverage for report schema and scenario outcomes.
  - Completion artifact: [`docs/roadmap/0.3-self-hosted-factory-dogfooding-completion.md`](./docs/roadmap/0.3-self-hosted-factory-dogfooding-completion.md)

## Roadmap Board (Single Source of Truth)
### Now
| ID | Item | Status | Next execution focus |
| --- | --- | --- | --- |
| `RMD-020` | First-class subagent orchestration | Done | Closed via finalization batch 1 on 2026-02-11 — see completion report. |
| `RMD-021` | Git worktree compatibility guarantees | Done | Parity check PASS captured; strict CI mode retained — see completion report. |
| `RMD-022` | Compound loop enforcement in contribution flow | Done | Compliance gate + weekly reporting finalized — see completion report. |
| `RMD-035` | Self-hosted factory dogfooding | Done | Closed via deterministic self-host loop command and lock enforcement report — see completion report. |

### Next
| ID | Item | Status | Exit criteria |
| --- | --- | --- | --- |
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
