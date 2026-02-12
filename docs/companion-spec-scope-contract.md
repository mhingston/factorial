# Companion Spec Scope Contract

Last updated: 2026-02-12

This document declares explicit adoption scope for the companion specs referenced by this repository:
- coding-agent-loop
- unified-llm

Status values:
- `implemented`: behavior is implemented and backed by deterministic repository evidence.
- `partial`: bounded/selected adoption exists, but full reference breadth is intentionally not claimed.
- `out-of-scope`: not targeted by current roadmap scope.

## Coding-Agent-Loop Scope
| capability | status | repository declaration | Evidence |
| --- | --- | --- | --- |
| Provider-aligned orchestration boundary | `implemented` | Codergen orchestration routes model execution through adapter contracts rather than provider-specific handler logic. | `packages/core/src/handlers/codergen.test.ts` (`routes codergen execution through adapter boundary`), `docs/roadmap/0.3-provider-adapter-convergence-completion.md` |
| Deterministic loop execution controls (retry/checkpoint/replay/human gate) | `implemented` | Core execution loop supports deterministic run/resume/replay artifacts with explicit lock and human-gate flows. | `packages/core/src/engine/resume.test.ts`, `packages/core/src/engine/targeted-retry.test.ts`, `packages/cli/src/e2e-smoke.test.ts`, `packages/cli/src/self-host-dogfood.test.ts` |
| Fully autonomous factory self-construction claims | `implemented` | Repository currently claims `autonomous` readiness only with objective AU-001/AU-002 gate evidence and staged promotion from `provider-backed`. | `docs/self-hosting-maturity-ladder.md`, `scripts/self-host-maturity.js`, `packages/cli/src/self-host-maturity.test.ts`, `docs/metrics/reports/self-host-autonomous-latest.json` |
| Unbounded unattended autonomous operation across external systems | `implemented` | BK-018 phase 4 delivered full autonomy telemetry and self-healing evidence with explicit FA-008/FA-009 reports and guardrails. | `docs/roadmap/backlog-bk-018-full-autonomy-maturity-criteria.md`, `docs/self-hosting-maturity-ladder.md` (FA-* gates) |

## Unified-LLM Scope
| capability | status | repository declaration | Evidence |
| --- | --- | --- | --- |
| Unified adapter contract (`complete`/`stream`) | `implemented` | Core defines and uses a backend-agnostic adapter contract for model invocations. | `packages/core/src/types/index.ts` (`LlmAdapter`), `packages/core/src/llm/index.test.ts` (`DefaultLlmAdapter stream`) |
| Deterministic normalized parity evidence across providers | `implemented` | Equivalent normalized API outcomes are verified for at least two providers (`openai`, `anthropic`). | `packages/core/src/handlers/codergen.test.ts` (provider parity assertions), `docs/roadmap/0.3-provider-adapter-convergence-completion.md` |
| Full breadth parity across all provider-native features | `partial` | Core parity claims are bounded to normalized execution outcomes; full feature-by-feature provider parity is not claimed. | `docs/spec-conformance-matrix.md` (`ULLM-DELTA-01`/`ULLM-DELTA-02`) |
| Provider-specific advanced feature completeness (all native tool modes/stream granularities) | `out-of-scope` | Repository targets normalized orchestration boundaries, not exhaustive provider-native feature emulation. | `ROADMAP.md` external alignment notes and backlog scope |

## Claim Policy
- README/ROADMAP claims should use this contract plus `docs/spec-conformance-matrix.md` as the source of truth.
- Avoid “full conformance” language for companion specs unless every capability above is upgraded to `implemented` with evidence.

## Provider-Native Escape Hatch Policy
- Advanced provider-specific features must be passed via adapter-level `provider_options` or CLI flags and remain opt-in.
- Escape hatch usage must not be described as portable behavior in README or roadmap claims.
- Any escape hatch surfaced to users should document which providers support it and the evidence artifact that verifies usage.
