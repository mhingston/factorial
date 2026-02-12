---
title: "Confidence Recommendation Publication Pattern"
category: "reliability"
tags:
  - "confidence-gate"
  - "human-escalation"
  - "deterministic-artifacts"
  - "data-driven-tuning"
date: "2026-02-12"
trigger: "OP-002 required deterministic confidence recommendation publication loop."
---

# Problem
`confidence.gate` emitted per-run artifacts (`confidence_result.json`), but there was no standardized mechanism to aggregate these into actionable tuning recommendations consumable by the review workflow.

# Solution Pattern
Add a dedicated publication command (`npm run confidence:publish`) that:
1. Scans one or more logs roots for `confidence_result.json` artifacts
2. Validates and aggregates confidence observations per node
3. Generates quantile-based threshold recommendations for target escalation rates
4. Ranks escalation target candidates by frequency
5. Emits deterministic publication report with explicit policy constraints:
   - `recommendation_only: true` (never auto-apply)
   - `requires_human_lock_review: true` (human gate required)
   - Sample sufficiency tracking (`ready` vs `insufficient_samples`)

## Report Contract
```typescript
{
  schema_version: 'confidence_tune_publication_report.v1',
  generated_at: string,
  publication: {
    command: 'npm run confidence:publish',
    policy: {
      recommendation_only: true,
      requires_human_lock_review: true,
      auto_apply_supported: false,
    }
  },
  recommendations: {
    nodes: [{
      node_id: string,
      recommendation_status: 'ready' | 'insufficient_samples',
      observed_confidence: { min, p50, p90, max, mean },
      recommended_threshold: number,
      route_candidates: [{ target, count }],
      recommended_escalation_target: string,
    }]
  }
}
```

# Key Insights
1. **Deterministic aggregation**: Historical artifacts → stable recommendations via quantile analysis
2. **Explicit constraints**: Policy metadata enforces review-only consumption
3. **Sample sufficiency**: Prevents decisions on insufficient data (configurable min-samples threshold)
4. **Route optimization**: Data-driven escalation target selection based on historical patterns

# Implementation References
- Files touched:
  - `scripts/confidence-tune-publish.js` (new)
  - `package.json` (added `confidence:publish` script)
  - `packages/cli/src/confidence-tune-publish.test.ts` (new)
- Tests added/updated:
  - `packages/cli/src/confidence-tune-publish.test.ts`
- Related plan/review artifacts:
  - `docs/plans/op-002-confidence-recommendation-publication.md`
  - `docs/reviews/op-001-op-002-completion-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run -- packages/cli/src/confidence-tune-publish.test.ts`
  - `npm run confidence:publish -- --logs-root ./logs --report ./report.json`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`

# AGENTS Update Note
- [x] Root agent context updated with this pattern
- Update location:
  - `AGENTS.md` "Common Mistakes" section now references confidence publication as pattern for data-driven policy tuning

# Reuse Guidance
- When to apply this pattern:
  - Any feature that emits deterministic per-run artifacts and needs auditable, data-driven policy tuning
  - When confidence thresholds need periodic review based on observed behavior
  - When escalation routes need optimization based on historical patterns
- When not to apply:
  - When decisions require real-time/live telemetry (this is offline batch analysis)
  - When auto-apply of recommendations is desired (this pattern explicitly forbids it)
- Known tradeoffs:
  - Recommendations are only as representative as the provided logs roots
  - Historical data may not reflect future behavior if system changes significantly

# Integration with Review Workflow
The publication report is designed as a review input:
1. Run `npm run confidence:publish` periodically (e.g., weekly)
2. Include report in review artifacts
3. Reviewer evaluates recommendations against current thresholds
4. Lock decision includes explicit adoption/rejection of recommendations
5. Changes to thresholds require separate PR with updated plan/review/compound
