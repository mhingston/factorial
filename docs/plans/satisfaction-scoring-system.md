# Satisfaction Scoring System Plan

## Goal
Replace boolean pass/fail with probabilistic LLM-as-judge satisfaction metrics.

## Scope
1. Judge rubric for scenario evaluation
2. Satisfaction aggregation formula
3. Target thresholds by scenario category
4. Satisfaction telemetry tracking

## Implementation Details

### 1. Judge Rubric
Create `packages/core/src/satisfaction/judge.ts`:

**Evaluation dimensions** (1-5 scale):
- Correctness: Did it solve the stated problem?
- Efficiency: Token usage vs theoretical optimal
- Maintainability: Code quality, test coverage, documentation
- Safety: No security issues, secrets leaked, or harmful changes

**Scoring**:
```typescript
interface SatisfactionScore {
  correctness: number;      // 1-5
  efficiency: number;       // 1-5
  maintainability: number;  // 1-5
  safety: number;           // 1-5
  overall: number;          // weighted average
}
```

### 2. Aggregation Formula
```typescript
// Per scenario
scenario_satisfaction = weighted_average(dimensions)

// Global satisfaction rate
satisfaction_rate = Σ(scenario_satisfaction × scenario_weight) / total_weight

// Scenario weights (difficulty-based):
// beginner=1.0, intermediate=1.5, expert=2.0
```

### 3. Target Thresholds
- Smoke scenarios: ≥95% satisfaction
- Regression scenarios: ≥90% satisfaction
- Holdout scenarios: ≥80% satisfaction
- Overall factory satisfaction: ≥85%

### 4. Telemetry
- Command: `factorial metrics:satisfaction --report satisfaction-latest.json`
- Tracks:
  - Per-provider satisfaction deltas
  - Trend over time (weekly aggregation)
  - Satisfaction by task type (bugfix vs feature)
- CI gate: Fails if satisfaction < threshold for category

## Affected Files
- `packages/core/src/satisfaction/judge.ts` (evaluation logic)
- `packages/core/src/satisfaction/index.ts` (aggregation)
- `packages/cli/src/commands/metrics-satisfaction.ts` (report command)
- `packages/core/src/dtu/scenario-harness.ts` (integrate scoring)

## Validation
- Unit tests for scoring algorithm
- Golden fixtures for judge rubric
- E2E test for satisfaction report

## Issue ID
SS-001
