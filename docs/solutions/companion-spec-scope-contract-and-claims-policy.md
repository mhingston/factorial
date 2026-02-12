---
title: "Companion spec scope contract and claims policy"
category: "process"
tags:
  - "spec-scope"
  - "claims-policy"
  - "traceability"
date: "2026-02-11"
trigger: "BK-005 required explicit companion-spec scope declarations with auditable evidence."
---

# Problem
Companion-spec adoption was described as “partial” in roadmap notes, but there was no single scope contract declaring what is implemented versus partial versus out-of-scope with direct evidence links.

# Solution Pattern
Create a dedicated companion-spec scope contract document that:
- defines status semantics (`implemented`, `partial`, `out-of-scope`),
- maps coding-agent-loop and unified-llm capabilities to those statuses,
- links each capability to deterministic repository evidence (tests/docs),
- drives README/ROADMAP claims wording as the source of truth.

# Key Insight
Ambiguous conformance claims are best resolved by separating “what is implemented now” from “what remains intentionally partial/out-of-scope,” and binding both to concrete evidence.

# Implementation References
- Files touched:
  - `docs/companion-spec-scope-contract.md`
  - `docs/spec-conformance-matrix.md`
  - `README.md`
  - `ROADMAP.md`
- Tests added/updated:
  - None (documentation and claims-contract closure only).
- Related plan/review artifacts:
  - `docs/plans/bk-005-companion-spec-scope-contract-batch-1-plan.md`
  - `docs/reviews/bk-005-companion-spec-scope-contract-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - Scope contract rows include explicit status and evidence links.
  - `ULLM-DELTA-02` matrix row closed with scope-contract reference.
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - No `AGENTS.md` update required; default guidance already enforces roadmap-linked evidence artifacts and lock-based convergence.

# Reuse Guidance
- When to apply this pattern:
  - Any roadmap track where external-spec alignment claims need precise, auditable scope boundaries.
- When not to apply:
  - Internal refactors with no external-spec claim surface.
- Known tradeoffs:
  - Scope contract requires ongoing maintenance as capabilities graduate between statuses.
