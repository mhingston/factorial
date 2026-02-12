# Economic Visibility Implementation Plan

## Goal
Implement token economics tracking and dashboard as first-class metrics.

## Scope
1. Per-task LLM call attribution (workflow node ID, scenario ID, run manifest)
2. Cost-per-PR calculation across Plan→Work→Review→Compound phases
3. Daily spend target warnings (configurable, default $1,000/day soft warning at 80%)
4. Economic telemetry report command: `npm run metrics:economics`

## Implementation Details

### 1. Attribution Layer
- Extend codergen handler to tag LLM calls with:
  - `workflow_node_id`: Current graph node
  - `scenario_id`: From DTU context or manual run
  - `run_manifest_id`: Link to manifest.json
  - `phase`: plan|work|review|compound|other

### 2. Cost Calculation
- Create `packages/core/src/economics/` module
- Provider cost table (input/output per 1M tokens):
  - OpenAI: GPT-5.2 ($2.50/$10.00), GPT-5.2-mini ($0.15/$0.60)
  - Anthropic: Claude Opus 4.6 ($15.00/$75.00), Sonnet 4.5 ($3.00/$15.00)
- Calculate: `(input_tokens × input_rate + output_tokens × output_rate) / 1,000,000`

### 3. Report Command
- CLI: `factorial metrics:economics --start-date YYYY-MM-DD --end-date YYYY-MM-DD`
- Output: `economics_report.v1.json` with:
  - total_spend_usd
  - spend_by_provider
  - spend_by_phase
  - spend_by_scenario_category
  - tokens_per_merged_pr (efficiency trend)
  - daily_spend_series

### 4. CI Integration
- Add economics check to weekly compound metrics
- Warn if daily average > $800 (80% of $1,000 target)

## Affected Files
- `packages/core/src/handlers/codergen.ts` (add attribution)
- `packages/core/src/economics/index.ts` (new module)
- `packages/cli/src/commands/metrics-economics.ts` (new command)
- `scripts/economics-report.js` (report generation)

## Validation
- Unit tests for cost calculation accuracy
- E2E test for report generation
- Verify attribution in existing codergen tests

## Issue ID
EV-001
