---
title: "Native stream delta parity and codergen transcript conformance"
category: "reliability"
tags:
  - "streaming-parity"
  - "transcript-conformance"
date: "2026-02-12"
trigger: "BK-011 required native stream delta fidelity, deterministic stream-vs-complete parity proofs, and codergen transcript provenance artifacts."
---

# Problem
The adapter stream path still behaved like a single-shot wrapper and codergen stages did not publish deterministic stream transcript artifacts. That left parity and conformance claims under-evidenced across stream, stage artifacts, and run manifest provenance.

# Solution Pattern
Implement native stream delta flow for supported backends, add deterministic parity tests (`accumulate(stream) == complete`), and publish deterministic transcript artifacts (`stream_transcript.json` + `stream_transcript.ndjson`) with additive provenance tooling fields.

# Key Insight
Stream reliability claims become auditable only when delta flow, parity assertions, and artifact provenance are implemented as one coherent contract.

# Implementation References
- Files touched:
  - `packages/core/src/llm/index.ts`
  - `packages/core/src/llm/index.test.ts`
  - `packages/core/src/handlers/builtin.ts`
  - `packages/core/src/handlers/codergen.test.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
  - `docs/spec-conformance-matrix.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/core/src/llm/index.test.ts`
  - `packages/core/src/handlers/codergen.test.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-plan.md`
  - `docs/reviews/bk-011-native-streaming-parity-and-transcript-conformance-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - Native API/CLI stream contracts now emit deterministic `llm.stream.start|delta|end|error` flow with normalized end metadata.
  - Parity tests prove accumulated stream text equals `complete` output for targeted API/CLI paths.
  - Codergen stage artifacts now publish deterministic transcript JSON/NDJSON files and expose transcript paths via run manifest tooling.
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`
  - `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not required for BK-011 batch 1; no new reusable default process pattern beyond issue-scoped implementation was introduced.

# Reuse Guidance
- When to apply this pattern:
  - Adapter/backends where stream claims must be backed by deterministic parity and stage-level transcript evidence.
- When not to apply:
  - Non-streaming handlers or one-shot operations that do not expose stream contracts.
- Known tradeoffs:
  - Stream transcript artifact publication increases stage artifact size and manifest tooling surface area.
