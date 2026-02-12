---
title: "Full autonomy claim synchronization"
category: "process"
tags:
  - "claims-consistency"
  - "maturity"
  - "documentation"
date: "2026-02-12"
trigger: "Full-autonomy promotion with published FA evidence required claim alignment"
---

# Problem
Cross-document maturity and scope declarations drifted during full-autonomy promotion, causing claims-consistency audit failures.

# Solution Pattern
Synchronize maturity level declarations and unattended-scope boundaries across roadmap, maturity ladder, companion scope, and conformance matrix, then re-run the claims audit to lock the promotion.

# Key Insight
Claims-consistency is a gating contract; update all claim-bearing sources together or the audit will fail even if evidence is published.

# Implementation References
- Files touched:
  - `ROADMAP.md`
  - `docs/self-hosting-maturity-ladder.md`
  - `docs/spec-conformance-matrix.md`
  - `docs/companion-spec-scope-contract.md`
  - `docs/roadmap/active-handoff.md`
  - `README.md`
  - `docs/metrics/reports/claims-consistency-latest.json`
- Tests added/updated:
  - none (doc-only)
- Related plan/review artifacts:
  - `docs/plans/full-autonomy-promotion-plan.md`
  - `docs/reviews/full-autonomy-promotion-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run claims:audit -- --report ./docs/metrics/reports/claims-consistency-latest.json` (overall_status: pass)
- What validated reliability over time:
  - CI claims-consistency gate in `.github/workflows/ci.yml` (ongoing)

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location: `AGENTS.md`

# Reuse Guidance
- When to apply this pattern:
  - Any maturity-level promotion or change in autonomy scope claims.
- When not to apply:
  - Single-document edits that do not impact cross-doc claims.
- Known tradeoffs:
  - Requires coordinated edits across multiple documents before validation can pass.
