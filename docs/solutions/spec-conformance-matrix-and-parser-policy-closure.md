---
title: "Spec-conformance matrix and parser policy closure"
category: "process"
tags:
  - "spec-conformance"
  - "parser-policy"
  - "traceability"
date: "2026-02-11"
trigger: "BK-004 required explicit external-spec delta mapping and strict parser policy closure."
---

# Problem
Conformance behavior existed in code/tests, but there was no single auditable artifact mapping active Attractor/coding-agent-loop/unified-llm deltas to evidence, and parser policy clarity was fragmented across implementation details.

# Solution Pattern
Publish a dedicated conformance matrix (`docs/spec-conformance-matrix.md`) that records:
- delta ID and external spec source,
- repo decision and closure status (`closed|open`),
- direct evidence links (tests/docs),
- explicit follow-up issue IDs for open deltas.

Pair this with a primary README policy statement for strict parser mode:
- accept `digraph` and `strict digraph`,
- reject undirected `graph` mode.

# Key Insight
Spec-conformance work closes faster when policy decisions and evidence links are centralized in one delta-focused matrix rather than spread across plans/reviews/tests.

# Implementation References
- Files touched:
  - `docs/spec-conformance-matrix.md`
  - `README.md`
  - `ROADMAP.md`
- Tests added/updated:
  - None (existing parser/lint/engine/adapter tests already covered required behavior).
- Related plan/review artifacts:
  - `docs/plans/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-plan.md`
  - `docs/reviews/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - Matrix rows map each active delta to concrete evidence tests/docs and follow-up IDs.
  - Parser policy declaration matches existing parser/test behavior.
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - No `AGENTS.md` update required; current guidance already mandates deterministic evidence and roadmap-linked artifacts.

# Reuse Guidance
- When to apply this pattern:
  - Any roadmap item that needs clear external-spec traceability and explicit closure boundaries.
- When not to apply:
  - Small internal-only refactors with no spec alignment claim.
- Known tradeoffs:
  - Matrix upkeep is manual; stale links can reintroduce ambiguity if not updated with each closure batch.
