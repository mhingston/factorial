---
title: "Satisfaction Scoring System with LLM-as-Judge"
category: "correctness"
tags:
  - "testing"
  - "llm-as-judge"
  - "metrics"
date: "2026-02-12"
trigger: "SS-001: Replace boolean pass/fail with probabilistic satisfaction metrics"
---

# Problem
Traditional boolean pass/fail testing doesn't capture the nuanced quality of AI-generated responses. We need:
1. Multi-dimensional evaluation (correctness, efficiency, maintainability, safety)
2. Probabilistic scoring instead of binary outcomes
3. Weighted aggregation across scenario suites
4. Configurable thresholds by scenario category

# Solution Pattern

## 1. Dual-Mode Scoring
- **Deterministic scoring**: Compare expected vs actual responses structurally
- **LLM-as-judge scoring**: Use LLM to evaluate rubric dimensions (1-5 scale)
- **Combined score**: Weighted average of both approaches

## 2. Rubric Dimensions
| Dimension | Weight | Description |
|-----------|--------|-------------|
| Correctness | 40% | Did it solve the problem accurately? |
| Efficiency | 20% | Token/resource usage optimization |
| Maintainability | 20% | Code quality, documentation, test coverage |
| Safety | 20% | Security issues, secrets, harmful changes |

## 3. Threshold Configuration
- Smoke scenarios: ≥95% satisfaction
- Regression scenarios: ≥90% satisfaction
- Holdout scenarios: ≥80% satisfaction
- Overall: ≥85% satisfaction

## 4. Weighted Aggregation
```typescript
// Per-scenario weight by difficulty
smoke = 1.0, regression = 1.5, holdout = 2.0

// Global satisfaction
weighted_overall = Σ(scenario_score × weight) / Σ(weights)
```

# Key Insight
Probabilistic scoring requires both deterministic verification (for regression safety) and LLM judgment (for qualitative assessment). The combination provides robust evaluation while maintaining CI gate reliability.

# Implementation References

## Files Created/Modified:
- `packages/core/src/satisfaction/judge.ts` - LLM-as-judge evaluation logic
- `packages/core/src/satisfaction/judge.test.ts` - Unit tests for judge utilities
- `packages/core/src/satisfaction/index.ts` - Aggregation and reporting
- `packages/core/src/satisfaction/index.test.ts` - Unit tests for aggregation
- `packages/core/src/index.ts` - Export satisfaction module
- `packages/cli/src/index.ts` - Add `metrics:satisfaction` CLI command

## Key Interfaces:
```typescript
interface LlmSatisfactionScore {
  correctness: number;      // 1-5
  efficiency: number;       // 1-5
  maintainability: number;  // 1-5
  safety: number;           // 1-5
  overall: number;          // weighted average
  confidence: number;       // 0-1
  reasoning: string;
}

interface SatisfactionReport {
  schema_version: 'satisfaction_report.v1';
  aggregated: AggregatedSatisfaction;
  scenarios: ScenarioSatisfaction[];
  summary: {
    total: number;
    satisfied: number;
    marginal: number;
    unsatisfied: number;
    pass_rate: number;
  };
}
```

# Validation Evidence
- Unit tests cover aggregation logic, threshold checking, and score conversion
- CLI command tested with mock fixtures
- Threshold compliance verified with boundary tests

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern
- Update location: `docs/solutions/satisfaction-scoring-contract.md`

# Reuse Guidance
- **When to apply**: Any scenario-based testing requiring nuanced quality evaluation
- **When not to apply**: Simple true/false assertions or deterministic API contracts
- **Known tradeoffs**: 
  - LLM calls add latency and cost
  - Requires API key configuration
  - LLM scores may vary slightly between runs
