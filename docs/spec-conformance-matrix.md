# Spec Conformance Matrix

Last updated: 2026-02-12

This matrix tracks active deltas against referenced external specs and maps each delta to concrete repository evidence.

Policy decision closed by `BK-004`:
- Parser mode is **strict `digraph`-only**.
- Accepted: `digraph`, `strict digraph`.
- Rejected: undirected `graph` mode.

## Active Delta Matrix
| delta_id | External spec | Topic | Status | Repository decision / current behavior | Evidence (tests/docs) | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| `AT-DELTA-01` | Attractor | Graph mode parsing policy | `closed` | Enforce strict `digraph` parsing; reject undirected `graph` mode. | `packages/dot-parser/src/parser-wrapper.test.ts` (`rejects undirected graph mode and accepts strict digraph mode`), `packages/dot-parser/src/dot.pegjs` (`GraphType = "digraph"`). | None |
| `AT-DELTA-02` | Attractor | Exit-node cardinality | `closed` | Lint requires exactly one exit node (not “at least one”). | `packages/core/src/lint/index.ts` (`EXIT_NODE_COUNT`), `packages/core/src/lint/index.test.ts` (`reports multiple exit nodes as invalid`). | None |
| `AT-DELTA-03` | Attractor | `loop_restart` run-boundary semantics | `closed` | `loop_restart` creates fresh run segments and explicit restart boundary artifacts/events. | `packages/core/src/engine/loop-restart.test.ts` (`creates a fresh logs segment and run boundary event on loop_restart`). | None |
| `AT-DELTA-04` | Attractor | Manager loop local child execution | `closed` | Local child execution is explicit opt-in (`manager_local_child_execution=true`) and adapter-gated. | `packages/core/src/handlers/builtin.test.ts` (`runs local child execution adapter when enabled`, `fails fast when local child execution is enabled without adapter`). | None |
| `CAL-DELTA-01` | coding-agent-loop | Provider-aligned backend abstraction | `closed` | Codergen routes through adapter boundary and now publishes deterministic stream transcript artifacts while adapter stream emits native incremental delta flow for supported API/CLI paths. | `packages/core/src/handlers/codergen.test.ts` (`writes API artifacts for text generation`, `writes CLI invocation/stdout/stderr artifacts in cli mode`), `packages/core/src/llm/index.test.ts` (`DefaultLlmAdapter stream` suite), `packages/cli/src/e2e-smoke.test.ts` (`run command succeeds and writes codergen artifacts`), `docs/roadmap/backlog-bk-011-native-streaming-parity-and-transcript-conformance-completion.md`. | None |
| `CAL-DELTA-02` | coding-agent-loop | Fully autonomous factory loop claims | `closed` | Repository declares staged self-host maturity with objective promotion gates, explicit current-level claim (`provider-backed`), deterministic provider-backed/autonomous evidence contracts, and supplemental bounded provider live-canary evidence lane while keeping unattended external autonomy out-of-scope. | `scripts/self-host-maturity.js`, `scripts/self-host-provider-backed-report.js`, `scripts/self-host-provider-backed-live-report.js`, `scripts/self-host-autonomous-report.js`, `scripts/self-host-agent-audit-report.js`, `packages/cli/src/self-host-maturity.test.ts`, `packages/cli/src/self-host-provider-backed-report.test.ts`, `packages/cli/src/self-host-provider-backed-live-report.test.ts`, `packages/cli/src/self-host-autonomous-report.test.ts`, `packages/cli/src/self-host-agent-audit-report.test.ts`, `docs/self-hosting-maturity-ladder.md`, `docs/companion-spec-scope-contract.md`, `.github/workflows/ci.yml` (`self-host-maturity` job), `.github/workflows/provider-backed-live-canary.yml`. | None |
| `ULLM-DELTA-01` | unified-llm | Unified adapter contract (`complete`/`stream`) and normalized parity | `closed` | Core adapter contract is implemented; parity evidence exists for deterministic normalized outcomes across `openai` + `anthropic`. | `packages/core/src/types/index.ts` (`LlmAdapter`), `packages/core/src/llm/index.test.ts`, `packages/core/src/handlers/codergen.test.ts` (provider parity assertions), `docs/roadmap/0.3-provider-adapter-convergence-completion.md`. | None |
| `ULLM-DELTA-02` | unified-llm | Companion-spec breadth declaration and explicit in/out-of-scope mapping | `closed` | Companion spec scope contract now declares `implemented|partial|out-of-scope` boundaries with evidence-backed claims language. | `docs/companion-spec-scope-contract.md`, `README.md` (spec-scope references) | None |

## Notes
- This matrix is intentionally delta-focused; it records where conformance is closed vs still open.
- Companion scope details are declared in `docs/companion-spec-scope-contract.md`.
- Self-host maturity level declarations and promotion criteria are declared in `docs/self-hosting-maturity-ladder.md`.
