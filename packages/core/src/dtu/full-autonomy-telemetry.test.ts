import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OOD_THRESHOLDS,
  type FullAutonomyTelemetryRun,
  type FullAutonomyTelemetrySource,
  build30DayAggregate,
  buildFullAutonomyTelemetryReport,
  calculateDailyHash,
  categorizeRun,
  createDailySnapshot,
  createEscalationAlert,
  detectOOD,
  generateEscalationAlerts,
  validateFullAutonomyTelemetrySource,
  verifyHashChain,
} from './full-autonomy-telemetry.js';

const createBaseRun = (overrides: Partial<FullAutonomyTelemetryRun> = {}): FullAutonomyTelemetryRun => ({
  run_id: 'run-001',
  category: 'ci-lint',
  workflow_type: 'ci-lint',
  status: 'success',
  escalations_count: 0,
  escalation_reasons: ['none'],
  ood_detected: false,
  error_class: 'none',
  started_at: '2026-02-01T00:00:00.000Z',
  ended_at: '2026-02-01T00:10:00.000Z',
  ...overrides,
});

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
    createBaseRun({ run_id: 'run-1', category: 'ci-lint' }),
    createBaseRun({ run_id: 'run-2', category: 'codereview', workflow_type: 'codereview' }),
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
        createBaseRun({
          run_id: 'run-1',
          escalations_count: 1,
          escalation_reasons: ['human_discretion'],
        }),
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

describe('30-day aggregation', () => {
  it('creates daily snapshot with hash chain', () => {
    const runs = [createBaseRun({ run_id: 'run-001' })];
    const snapshot = createDailySnapshot('2026-02-01', runs, null);

    expect(snapshot.date).toBe('2026-02-01');
    expect(snapshot.schema_version).toBe('daily_telemetry_snapshot.v1');
    expect(snapshot.hash).toBeTruthy();
    expect(snapshot.previous_hash).toBeNull();
    expect(snapshot.summary.total_runs).toBe(1);
    expect(snapshot.summary.success_count).toBe(1);
    expect(snapshot.summary.escalation_count).toBe(0);
  });

  it('verifies hash chain integrity', () => {
    const snapshot1 = createDailySnapshot('2026-02-01', [createBaseRun()], null);
    const snapshot2 = createDailySnapshot('2026-02-02', [createBaseRun({ run_id: 'run-002' })], snapshot1.hash);

    expect(verifyHashChain([snapshot1, snapshot2])).toBe(true);
  });

  it('detects tampered hash chain', () => {
    const snapshot1 = createDailySnapshot('2026-02-01', [createBaseRun()], null);
    const snapshot2 = createDailySnapshot('2026-02-02', [createBaseRun()], 'invalid-hash');

    expect(verifyHashChain([snapshot1, snapshot2])).toBe(false);
  });

  it('builds 30-day aggregate with categorization', () => {
    const snapshots = [
      createDailySnapshot('2026-02-01', [
        createBaseRun({ category: 'ci-lint', workflow_type: 'ci-lint', error_class: 'none' }),
        createBaseRun({ run_id: 'run-002', category: 'codereview', workflow_type: 'codereview', error_class: 'none' }),
      ], null),
      createDailySnapshot('2026-02-02', [
        createBaseRun({ run_id: 'run-003', category: 'ci-lint', workflow_type: 'ci-lint', error_class: 'provider_api_failure' }),
      ], null),
    ];

    const aggregate = build30DayAggregate(snapshots);

    expect(aggregate.total_days).toBe(2);
    expect(aggregate.days_with_data).toBe(2);
    expect(aggregate.category_distribution['ci-lint']).toBe(2);
    expect(aggregate.category_distribution['codereview']).toBe(1);
    expect(aggregate.workflow_type_distribution['ci-lint']).toBe(2);
    expect(aggregate.workflow_type_distribution['codereview']).toBe(1);
    expect(aggregate.error_class_distribution['provider_api_failure']).toBe(1);
    expect(aggregate.error_class_distribution['none']).toBe(2);
  });

  it('handles missing days with interpolation', () => {
    const snapshots = [
      createDailySnapshot('2026-02-01', [createBaseRun()], null),
      createDailySnapshot('2026-02-03', [createBaseRun({ run_id: 'run-002' })], null),
    ];

    const aggregate = build30DayAggregate(snapshots, { allowInterpolation: true });

    expect(aggregate.interpolated_days).toContain('2026-02-02');
    expect(aggregate.days_with_gaps).toBe(1);
  });
});

describe('OOD detection', () => {
  it('detects OOD when escalation rate exceeds threshold', () => {
    const result = detectOOD(
      { escalationRate: 0.1, failureRate: 0.05, oodRate: 0.01 },
      DEFAULT_OOD_THRESHOLDS
    );

    expect(result.is_ood).toBe(true);
    expect(result.trigger_metric).toBe('escalation_rate');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('does not detect OOD within normal ranges', () => {
    const result = detectOOD(
      { escalationRate: 0.005, failureRate: 0.01, oodRate: 0.001 },
      DEFAULT_OOD_THRESHOLDS
    );

    expect(result.is_ood).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('detects OOD when failure rate exceeds threshold', () => {
    const result = detectOOD(
      { escalationRate: 0.001, failureRate: 0.25, oodRate: 0.001 },
      DEFAULT_OOD_THRESHOLDS
    );

    expect(result.is_ood).toBe(true);
    expect(result.trigger_metric).toBe('failure_rate');
  });
});

describe('escalation alerts', () => {
  it('creates escalation alert for run with escalations', () => {
    const run = createBaseRun({
      escalations_count: 1,
      escalation_reasons: ['human_discretion'],
    });

    const alert = createEscalationAlert(run, 'warning');

    expect(alert.severity).toBe('warning');
    expect(alert.escalation_run_id).toBe(run.run_id);
    expect(alert.escalation_reasons).toContain('human_discretion');
    expect(alert.message).toBe('Human intervention requested');
  });

  it('creates critical alert for security-related escalations', () => {
    const run = createBaseRun({
      escalations_count: 1,
      escalation_reasons: ['security_review_required'],
    });

    const alert = createEscalationAlert(run, 'critical');

    expect(alert.severity).toBe('critical');
    expect(alert.message).toBe('Security review required for workflow');
  });

  it('generates alerts from multiple runs', () => {
    const runs = [
      createBaseRun({ run_id: 'run-001', escalations_count: 1, escalation_reasons: ['human_discretion'] }),
      createBaseRun({ run_id: 'run-002', escalations_count: 0 }),
      createBaseRun({ run_id: 'run-003', escalations_count: 2, escalation_reasons: ['threshold_breach'] }),
    ];

    const alerts = generateEscalationAlerts(runs);

    expect(alerts).toHaveLength(2);
    expect(alerts.map(a => a.escalation_run_id)).toContain('run-001');
    expect(alerts.map(a => a.escalation_run_id)).toContain('run-003');
  });
});

describe('run categorization', () => {
  it('categorizes run with default values', () => {
    const run = categorizeRun({
      run_id: 'run-001',
      category: 'ci-lint',
      status: 'success',
      escalations_count: 0,
      ood_detected: false,
      started_at: '2026-02-01T00:00:00.000Z',
      ended_at: '2026-02-01T00:10:00.000Z',
    });

    expect(run.workflow_type).toBe('other');
    expect(run.error_class).toBe('none');
    expect(run.escalation_reasons).toEqual(['none']);
  });

  it('categorizes run with explicit values', () => {
    const run = categorizeRun(
      {
        run_id: 'run-001',
        category: 'ci-lint',
        status: 'fail',
        escalations_count: 1,
        ood_detected: false,
        started_at: '2026-02-01T00:00:00.000Z',
        ended_at: '2026-02-01T00:10:00.000Z',
      },
      {
        workflowType: 'ci-lint',
        errorClass: 'provider_api_failure',
        escalationReasons: ['external_dependency_failure'],
      }
    );

    expect(run.workflow_type).toBe('ci-lint');
    expect(run.error_class).toBe('provider_api_failure');
    expect(run.escalation_reasons).toContain('external_dependency_failure');
  });
});

describe('hash chain verification', () => {
  it('produces deterministic hashes', () => {
    const runs = [createBaseRun()];
    const hash1 = calculateDailyHash('2026-02-01', runs, null);
    const hash2 = calculateDailyHash('2026-02-01', runs, null);

    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different data', () => {
    const hash1 = calculateDailyHash('2026-02-01', [createBaseRun()], null);
    const hash2 = calculateDailyHash('2026-02-01', [createBaseRun({ run_id: 'run-002' })], null);

    expect(hash1).not.toBe(hash2);
  });
});
