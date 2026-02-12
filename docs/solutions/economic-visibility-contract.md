# Economic Visibility Contract

**Issue ID**: EV-001  
**Created**: 2026-02-12  
**Status**: Resolved

## Problem Statement

Implement token economics tracking and dashboard as first-class metrics for the Factorial workflow runner.

## Solution Overview

Created a comprehensive economics module that:

1. **Attribution Layer**: Tags every LLM call with workflow context (node_id, scenario_id, manifest_id, phase)
2. **Cost Calculation**: Accurate per-call cost computation using provider rate cards
3. **Report Generation**: CLI command and programmatic API for economics reporting
4. **Spend Monitoring**: Configurable daily spend warnings

## Implementation Details

### Files Modified/Created

```
packages/core/src/economics/index.ts          # New: Economics module
packages/core/src/economics/index.test.ts     # New: Unit tests
packages/core/src/handlers/builtin.ts         # Modified: Added attribution tags
packages/cli/src/index.ts                     # Modified: Added metrics:economics command
packages/cli/src/economics-e2e.test.ts        # New: E2E tests
```

### Attribution Tags

Added to codergen handler output.json:

```json
{
  "attribution": {
    "workflow_node_id": "generate_code",
    "scenario_id": "scenario-123",
    "run_manifest_id": "manifest-456",
    "phase": "work"
  }
}
```

Phase detection uses node ID heuristics with context override capability:
- `plan` - node IDs containing "plan", "design"
- `work` - node IDs containing "work", "implement", "generate"
- `review` - node IDs containing "review", "audit", "check"
- `compound` - node IDs containing "compound", "report"

### Provider Cost Table

Rates per 1M tokens (input/output):

| Provider | Model | Input | Output |
|----------|-------|-------|--------|
| OpenAI | gpt-4o | $2.50 | $10.00 |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 |
| Anthropic | claude-opus | $15.00 | $75.00 |
| Anthropic | claude-sonnet | $3.00 | $15.00 |
| Google | gemini-2.0-flash | $0.35 | $1.05 |

### Usage

CLI command:
```bash
# Generate report
factorial metrics:economics --logs-root ./logs --json

# Filter by date range
factorial metrics:economics \
  --logs-root ./logs \
  --start-date 2026-02-01 \
  --end-date 2026-02-12 \
  --output report.json
```

Programmatic API:
```typescript
import { collectEconomicsRecords, buildEconomicsReport } from './economics';

const records = await collectEconomicsRecords('./logs', {
  startDate: new Date('2026-02-01'),
  endDate: new Date('2026-02-12'),
});

const report = buildEconomicsReport(records, {
  start: '2026-02-01',
  end: '2026-02-12',
});
```

## Report Schema

```typescript
interface EconomicsReport {
  schemaVersion: 'economics_report.v1';
  generatedAt: string;
  dateRange: { start: string; end: string };
  summary: {
    totalSpendUsd: number;
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  byProvider: Record<string, ProviderMetrics>;
  byPhase: Record<string, PhaseMetrics>;
  byScenarioCategory: Record<string, ScenarioMetrics>;
  dailySpendSeries: DailySpend[];
  efficiencyMetrics: {
    tokensPerMergedPr: number | null;
    costPerMergedPr: number | null;
  };
  records: EconomicsRecord[];
}
```

## Testing

- **Unit tests**: 36 tests covering cost calculation, usage parsing, phase detection
- **E2E tests**: CLI command validation with mock data

Run tests:
```bash
npm run test:run -- packages/core/src/economics/index.test.ts
```

## Known Limitations

1. **Cost rates hardcoded**: Provider pricing updates require code changes
2. **Phase detection heuristic**: Relies on node naming conventions
3. **PR efficiency metrics**: Not yet implemented (require PR tracking integration)

## Future Enhancements

- [ ] External cost configuration file
- [ ] CI integration for daily spend alerts
- [ ] PR tracking integration for efficiency metrics
- [ ] Provider-specific rate card overrides

## References

- Implementation Plan: `docs/plans/economic-visibility-implementation.md`
- Review: `docs/reviews/ev-001-batch-1-review.md`
