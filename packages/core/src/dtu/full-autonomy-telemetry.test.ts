import { describe, expect, it } from 'vitest';
import {
  type FullAutonomyTelemetrySource,
  buildFullAutonomyTelemetryReport,
  validateFullAutonomyTelemetrySource,
} from './full-autonomy-telemetry.js';

const baseSource: FullAutonomyTelemetrySource = {
  schema_version: 'full_autonomy_telemetry_source.v1',
  generated_at: '2026-02-12T00:00:00.000Z',
  window: {
    start: '2026-01-13T00:00:00.000Z',
    end: '2026-02-12T00:00:00.000Z',
  },
  maintenance_window_days: 30,
  categories: [
    { id: 'ci-lint', description: 'Lint-only CI workflows' },
    { id: 'codereview', description: 'Code review pipelines' },
  ],
  runs: [
    {
      run_id: 'run-1',
      category: 'ci-lint',
      status: 'success',
      escalations_count: 0,
      ood_detected: false,
      started_at: '2026-02-01T00:00:00.000Z',
      ended_at: '2026-02-01T00:10:00.000Z',
    },
    {
      run_id: 'run-2',
      category: 'codereview',
      status: 'success',
      escalations_count: 0,
      ood_detected: false,
      started_at: '2026-02-02T00:00:00.000Z',
      ended_at: '2026-02-02T00:12:00.000Z',
    },
  ],
};

describe('full-autonomy-telemetry', () => {
  it('validates source payload', () => {
    const result = validateFullAutonomyTelemetrySource(baseSource);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('builds a passing report for zero escalation and 30-day window', () => {
    const report = buildFullAutonomyTelemetryReport({
      sourcePath: 'docs/metrics/reports/full-autonomy-telemetry-source-latest.json',
      source: baseSource,
      today: new Date('2026-02-12T00:00:00.000Z'),
    });

    expect(report.fa_008_status).toBe('pass');
    expect(report.summary.zero_escalation_rate).toBe(1);
    expect(report.summary.ood_rate).toBe(0);
    expect(report.validation.passed).toBe(true);
  });

  it('fails when escalations occur', () => {
    const source: FullAutonomyTelemetrySource = {
      ...baseSource,
      runs: [
        {
          run_id: 'run-1',
          category: 'ci-lint',
          status: 'success',
          escalations_count: 1,
          ood_detected: false,
          started_at: '2026-02-01T00:00:00.000Z',
          ended_at: '2026-02-01T00:10:00.000Z',
        },
      ],
    };
    const report = buildFullAutonomyTelemetryReport({
      sourcePath: 'docs/metrics/reports/full-autonomy-telemetry-source-latest.json',
      source,
      today: new Date('2026-02-12T00:00:00.000Z'),
    });
    expect(report.fa_008_status).toBe('fail');
    expect(report.validation.passed).toBe(false);
  });
});
