import { describe, expect, it } from 'vitest';
import { type SelfHealingScenario, buildSelfHealingReport } from './self-healing.js';

describe('self-healing', () => {
  it('builds report with required checks', () => {
    const scenarios: SelfHealingScenario[] = [
      {
        scenario_id: 'transient-retry',
        attempts: [
          {
            attempt_id: 'a1',
            failure_class: 'transient',
            root_cause: 'network timeout',
            action: 'retry',
            status: 'success',
            notes: ['retry succeeded'],
          },
        ],
      },
      {
        scenario_id: 'reconstruct',
        attempts: [
          {
            attempt_id: 'b1',
            failure_class: 'tool_error',
            root_cause: 'tool output missing fields',
            action: 'reconstruct_state',
            status: 'success',
            notes: ['reconstructed state from checkpoints'],
          },
        ],
      },
      {
        scenario_id: 'alternate-path',
        attempts: [
          {
            attempt_id: 'c1',
            failure_class: 'quality_gap',
            root_cause: 'lint failures after patch',
            action: 'alternate_path',
            status: 'success',
            notes: ['routed to quality-fix path'],
          },
        ],
      },
    ];

    const report = buildSelfHealingReport(scenarios);
    expect(report.validation.passed).toBe(true);
    expect(report.fa_009_status).toBe('pass');
    expect(report.summary.total_scenarios).toBe(3);
    expect(report.summary.total_attempts).toBe(3);
    expect(report.summary.actions.reconstruct_state).toBe(1);
    expect(report.summary.actions.alternate_path).toBe(1);
  });
});
