import { createHash } from 'node:crypto';
import { z } from 'zod';

export interface FullAutonomyTelemetryCategory {
  id: string;
  description: string;
}

export type WorkflowType =
  | 'ci-lint'
  | 'ci-test'
  | 'ci-build'
  | 'codereview'
  | 'deployment'
  | 'self-healing'
  | 'maintenance'
  | 'other';

export type ErrorClass =
  | 'provider_api_failure'
  | 'workflow_timeout'
  | 'resource_exhaustion'
  | 'validation_failure'
  | 'circuit_breaker_open'
  | 'ood_detection'
  | 'unknown_error'
  | 'none';

export type EscalationReason =
  | 'security_review_required'
  | 'schema_violation'
  | 'threshold_breach'
  | 'human_discretion'
  | 'external_dependency_failure'
  | 'authorization_failure'
  | 'none';

export interface FullAutonomyTelemetryRun {
  run_id: string;
  category: string;
  workflow_type: WorkflowType;
  status: 'success' | 'fail';
  escalations_count: number;
  escalation_reasons: EscalationReason[];
  ood_detected: boolean;
  error_class: ErrorClass;
  started_at: string;
  ended_at: string;
}

export interface DailyTelemetrySnapshot {
  date: string;
  schema_version: 'daily_telemetry_snapshot.v1';
  runs: FullAutonomyTelemetryRun[];
  summary: {
    total_runs: number;
    success_count: number;
    failure_count: number;
    escalation_count: number;
    ood_count: number;
    categories_covered: string[];
  };
  hash: string;
  previous_hash: string | null;
}

export interface Telemetry30DayAggregate {
  window_start: string;
  window_end: string;
  total_days: number;
  days_with_data: number;
  days_with_gaps: number;
  daily_snapshots: DailyTelemetrySnapshot[];
  category_distribution: Record<string, number>;
  error_class_distribution: Record<ErrorClass, number>;
  escalation_reason_distribution: Record<EscalationReason, number>;
  workflow_type_distribution: Record<WorkflowType, number>;
  interpolated_days: string[];
  gap_fill_method: 'interpolation' | 'zero_fill' | 'null';
}

export interface OODDetectionThresholds {
  baseline_escalation_rate: number;
  baseline_failure_rate: number;
  baseline_ood_rate: number;
  sigma_multiplier: number;
  min_baseline_days: number;
}

export interface OODDetectionResult {
  is_ood: boolean;
  confidence: number;
  trigger_metric: string;
  trigger_value: number;
  threshold_value: number;
  baseline_stats: {
    mean: number;
    std_dev: number;
    sample_size: number;
  };
}

export interface EscalationAlert {
  alert_id: string;
  triggered_at: string;
  severity: 'warning' | 'critical';
  escalation_run_id: string;
  escalation_reasons: EscalationReason[];
  category: string;
  workflow_type: WorkflowType;
  message: string;
}

export interface FullAutonomyTelemetrySource {
  schema_version: 'full_autonomy_telemetry_source.v1';
  generated_at: string;
  window: { start: string; end: string };
  maintenance_window_days: number;
  categories: FullAutonomyTelemetryCategory[];
  runs: FullAutonomyTelemetryRun[];
  thirty_day_aggregate?: Telemetry30DayAggregate;
  ood_detection?: OODDetectionResult;
  escalation_alerts?: EscalationAlert[];
}

export const dailyTelemetrySnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  schema_version: z.literal('daily_telemetry_snapshot.v1'),
  runs: z.array(z.any()),
  summary: z.object({
    total_runs: z.number().int().nonnegative(),
    success_count: z.number().int().nonnegative(),
    failure_count: z.number().int().nonnegative(),
    escalation_count: z.number().int().nonnegative(),
    ood_count: z.number().int().nonnegative(),
    categories_covered: z.array(z.string()),
  }),
  hash: z.string(),
  previous_hash: z.string().nullable(),
});

export const telemetry30DayAggregateSchema = z.object({
  window_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  window_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_days: z.number().int().min(1).max(30),
  days_with_data: z.number().int().min(0).max(30),
  days_with_gaps: z.number().int().min(0).max(30),
  daily_snapshots: z.array(dailyTelemetrySnapshotSchema),
  category_distribution: z.record(z.string(), z.number()),
  error_class_distribution: z.record(z.string(), z.number()),
  escalation_reason_distribution: z.record(z.string(), z.number()),
  workflow_type_distribution: z.record(z.string(), z.number()),
  interpolated_days: z.array(z.string()),
  gap_fill_method: z.enum(['interpolation', 'zero_fill', 'null']),
});

export const oodDetectionResultSchema = z.object({
  is_ood: z.boolean(),
  confidence: z.number().min(0).max(1),
  trigger_metric: z.string(),
  trigger_value: z.number(),
  threshold_value: z.number(),
  baseline_stats: z.object({
    mean: z.number(),
    std_dev: z.number(),
    sample_size: z.number().int().positive(),
  }),
});

export const escalationAlertSchema = z.object({
  alert_id: z.string(),
  triggered_at: z.string().datetime(),
  severity: z.enum(['warning', 'critical']),
  escalation_run_id: z.string(),
  escalation_reasons: z.array(z.string()),
  category: z.string(),
  workflow_type: z.string(),
  message: z.string(),
});

export const fullAutonomyTelemetryReportSchema = z.object({
  schema_version: z.literal('full_autonomy_telemetry_report.v1'),
  generated_at: z.string().datetime(),
  source: z.object({
    path: z.string().min(1),
    schema_version: z.string().min(1),
    generated_at: z.string().datetime(),
    window: z.object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    }),
    maintenance_window_days: z.number().int().nonnegative(),
    age_days: z.number().int().nonnegative().nullable(),
  }),
  summary: z.object({
    total_runs: z.number().int().nonnegative(),
    zero_escalation_rate: z.number().min(0).max(1).nullable(),
    ood_rate: z.number().min(0).max(1).nullable(),
    categories_covered: z.number().int().nonnegative(),
    window_days: z.number().int().nonnegative(),
    maintenance_window_days: z.number().int().nonnegative(),
    thirty_day_aggregate: telemetry30DayAggregateSchema.optional(),
    ood_detection: oodDetectionResultSchema.optional(),
    escalation_alerts: z.array(escalationAlertSchema).optional(),
  }),
  checks: z.array(
    z.object({
      id: z.string().min(1),
      status: z.enum(['pass', 'fail']),
      summary: z.string().min(1),
    })
  ),
  validation: z.object({
    passed: z.boolean(),
    checks: z.array(
      z.object({
        id: z.string().min(1),
        status: z.enum(['pass', 'fail']),
        summary: z.string().min(1),
      })
    ),
  }),
  fa_008_status: z.enum(['pass', 'fail']),
});

export type FullAutonomyTelemetryReport = z.infer<typeof fullAutonomyTelemetryReportSchema>;

const SOURCE_SCHEMA_VERSION = 'full_autonomy_telemetry_source.v1';
const REQUIRED_WINDOW_DAYS = 30;

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function round(value: number, precision = 6): number {
  return Number(Number(value).toFixed(precision));
}

function daysBetween(start: Date, end: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / dayMs);
}

export function normalizeSource(source: FullAutonomyTelemetrySource) {
  const generatedAt = parseIsoDate(source.generated_at);
  const windowStart = parseIsoDate(source.window.start);
  const windowEnd = parseIsoDate(source.window.end);
  if (!generatedAt || !windowStart || !windowEnd) {
    return null;
  }
  return {
    ...source,
    generated_at: generatedAt.toISOString(),
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    },
  };
}

export function buildFullAutonomyTelemetryReport(params: {
  sourcePath: string;
  source: FullAutonomyTelemetrySource;
  today?: Date;
}): FullAutonomyTelemetryReport {
  const { sourcePath, source } = params;
  const today = params.today ?? new Date();
  const normalized = normalizeSource(source);
  const windowStart = normalized ? parseIsoDate(normalized.window.start) : null;
  const windowEnd = normalized ? parseIsoDate(normalized.window.end) : null;
  const windowDays = windowStart && windowEnd ? daysBetween(windowStart, windowEnd) : 0;
  const maintenanceDays = normalized?.maintenance_window_days ?? 0;

  const categoryIds = new Set((normalized?.categories ?? []).map(category => category.id));
  const totalRuns = normalized?.runs.length ?? 0;
  const zeroEscalationRuns = normalized
    ? normalized.runs.filter(run => run.escalations_count === 0).length
    : 0;
  const oodRuns = normalized ? normalized.runs.filter(run => run.ood_detected).length : 0;
  const categoriesCovered = normalized
    ? new Set(normalized.runs.map(run => run.category)).size
    : 0;
  const zeroEscalationRate = totalRuns > 0 ? round(zeroEscalationRuns / totalRuns) : null;
  const oodRate = totalRuns > 0 ? round(oodRuns / totalRuns) : null;

  const checks: Array<{ id: string; status: 'pass' | 'fail'; summary: string }> = [
    {
      id: 'FA-008-WINDOW',
      status: windowDays >= REQUIRED_WINDOW_DAYS ? 'pass' : 'fail',
      summary:
        windowDays >= REQUIRED_WINDOW_DAYS
          ? `Telemetry window spans ${windowDays} days.`
          : `Telemetry window spans ${windowDays} days (minimum ${REQUIRED_WINDOW_DAYS}).`,
    },
    {
      id: 'FA-008-MAINTENANCE',
      status: maintenanceDays >= REQUIRED_WINDOW_DAYS ? 'pass' : 'fail',
      summary:
        maintenanceDays >= REQUIRED_WINDOW_DAYS
          ? `Maintenance window spans ${maintenanceDays} days.`
          : `Maintenance window spans ${maintenanceDays} days (minimum ${REQUIRED_WINDOW_DAYS}).`,
    },
    {
      id: 'FA-008-CATEGORIES',
      status:
        categoryIds.size > 0 &&
        normalized?.runs.every(run => categoryIds.has(run.category))
          ? 'pass'
          : 'fail',
      summary:
        categoryIds.size > 0
          ? 'All runs mapped to defined workflow categories.'
          : 'Workflow categories are missing or invalid.',
    },
    {
      id: 'FA-008-ZERO-ESCALATION',
      status: zeroEscalationRate === 1 ? 'pass' : 'fail',
      summary:
        zeroEscalationRate === 1
          ? 'All runs completed without escalation.'
          : 'Escalations detected in telemetry window.',
    },
    {
      id: 'FA-008-OOD',
      status: oodRate === 0 ? 'pass' : 'fail',
      summary:
        oodRate === 0
          ? 'No out-of-distribution detections in window.'
          : 'Out-of-distribution detections recorded in window.',
    },
  ];

  const validationPassed = checks.every(check => check.status === 'pass');

  return {
    schema_version: 'full_autonomy_telemetry_report.v1',
    generated_at: new Date().toISOString(),
    source: {
      path: sourcePath,
      schema_version: normalized?.schema_version ?? '',
      generated_at: normalized?.generated_at ?? '',
      window: normalized?.window ?? { start: '', end: '' },
      maintenance_window_days: maintenanceDays,
      age_days: normalized && normalized.generated_at
        ? daysBetween(new Date(normalized.generated_at), today)
        : null,
    },
    summary: {
      total_runs: totalRuns,
      zero_escalation_rate: zeroEscalationRate,
      ood_rate: oodRate,
      categories_covered: categoriesCovered,
      window_days: windowDays,
      maintenance_window_days: maintenanceDays,
    },
    checks,
    validation: {
      passed: validationPassed,
      checks,
    },
    fa_008_status: validationPassed ? 'pass' : 'fail',
  };
}

export function validateFullAutonomyTelemetrySource(
  source: FullAutonomyTelemetrySource
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (source.schema_version !== SOURCE_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${SOURCE_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(source.maintenance_window_days) || source.maintenance_window_days <= 0) {
    errors.push('maintenance_window_days must be an integer > 0');
  }
  if (!source.categories || source.categories.length === 0) {
    errors.push('categories must contain at least one entry');
  }
  if (!source.runs || source.runs.length === 0) {
    errors.push('runs must contain at least one entry');
  }
  const categoryIds = new Set(source.categories.map(category => category.id));
  source.runs.forEach(run => {
    if (!categoryIds.has(run.category)) {
      errors.push(`run ${run.run_id} references unknown category ${run.category}`);
    }
  });
  return { valid: errors.length === 0, errors };
}

export function calculateDailyHash(
  date: string,
  runs: FullAutonomyTelemetryRun[],
  previousHash: string | null
): string {
  const data = JSON.stringify({ date, runs, previousHash });
  return createHash('sha256').update(data).digest('hex');
}

export function verifyHashChain(snapshots: DailyTelemetrySnapshot[]): boolean {
  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i];
    const expectedPreviousHash = i === 0 ? null : snapshots[i - 1].hash;
    if (snapshot.previous_hash !== expectedPreviousHash) {
      return false;
    }
    const calculatedHash = calculateDailyHash(snapshot.date, snapshot.runs, snapshot.previous_hash);
    if (calculatedHash !== snapshot.hash) {
      return false;
    }
  }
  return true;
}

export function createDailySnapshot(
  date: string,
  runs: FullAutonomyTelemetryRun[],
  previousHash: string | null
): DailyTelemetrySnapshot {
  const successCount = runs.filter(r => r.status === 'success').length;
  const failureCount = runs.filter(r => r.status === 'fail').length;
  const escalationCount = runs.filter(r => r.escalations_count > 0).length;
  const oodCount = runs.filter(r => r.ood_detected).length;
  const categories = [...new Set(runs.map(r => r.category))];
  const hash = calculateDailyHash(date, runs, previousHash);

  return {
    date,
    schema_version: 'daily_telemetry_snapshot.v1',
    runs,
    summary: {
      total_runs: runs.length,
      success_count: successCount,
      failure_count: failureCount,
      escalation_count: escalationCount,
      ood_count: oodCount,
      categories_covered: categories,
    },
    hash,
    previous_hash: previousHash,
  };
}

export function aggregateWorkflowTypes(
  runs: FullAutonomyTelemetryRun[]
): Record<WorkflowType, number> {
  const distribution: Record<string, number> = {};
  for (const type of [
    'ci-lint',
    'ci-test',
    'ci-build',
    'codereview',
    'deployment',
    'self-healing',
    'maintenance',
    'other',
  ] as WorkflowType[]) {
    distribution[type] = 0;
  }
  for (const run of runs) {
    distribution[run.workflow_type] = (distribution[run.workflow_type] || 0) + 1;
  }
  return distribution as Record<WorkflowType, number>;
}

export function aggregateErrorClasses(
  runs: FullAutonomyTelemetryRun[]
): Record<ErrorClass, number> {
  const distribution: Record<string, number> = {};
  for (const cls of [
    'provider_api_failure',
    'workflow_timeout',
    'resource_exhaustion',
    'validation_failure',
    'circuit_breaker_open',
    'ood_detection',
    'unknown_error',
    'none',
  ] as ErrorClass[]) {
    distribution[cls] = 0;
  }
  for (const run of runs) {
    distribution[run.error_class] = (distribution[run.error_class] || 0) + 1;
  }
  return distribution as Record<ErrorClass, number>;
}

export function aggregateEscalationReasons(
  runs: FullAutonomyTelemetryRun[]
): Record<EscalationReason, number> {
  const distribution: Record<string, number> = {};
  for (const reason of [
    'security_review_required',
    'schema_violation',
    'threshold_breach',
    'human_discretion',
    'external_dependency_failure',
    'authorization_failure',
    'none',
  ] as EscalationReason[]) {
    distribution[reason] = 0;
  }
  for (const run of runs) {
    for (const reason of run.escalation_reasons) {
      distribution[reason] = (distribution[reason] || 0) + 1;
    }
  }
  return distribution as Record<EscalationReason, number>;
}

export function build30DayAggregate(
  dailySnapshots: DailyTelemetrySnapshot[],
  options: {
    allowInterpolation?: boolean;
    gapFillMethod?: 'interpolation' | 'zero_fill' | 'null';
  } = {}
): Telemetry30DayAggregate {
  const { allowInterpolation = true, gapFillMethod = 'zero_fill' } = options;

  const sortedSnapshots = [...dailySnapshots].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const allRuns = sortedSnapshots.flatMap(s => s.runs);
  const categoryDistribution: Record<string, number> = {};
  for (const run of allRuns) {
    categoryDistribution[run.category] = (categoryDistribution[run.category] || 0) + 1;
  }

  const interpolatedDays: string[] = [];
  const filledSnapshots: DailyTelemetrySnapshot[] = [];

  if (sortedSnapshots.length === 0) {
    return {
      window_start: new Date().toISOString().slice(0, 10),
      window_end: new Date().toISOString().slice(0, 10),
      total_days: 0,
      days_with_data: 0,
      days_with_gaps: 0,
      daily_snapshots: [],
      category_distribution: {},
      error_class_distribution: aggregateErrorClasses([]),
      escalation_reason_distribution: aggregateEscalationReasons([]),
      workflow_type_distribution: aggregateWorkflowTypes([]),
      interpolated_days: [],
      gap_fill_method: gapFillMethod,
    };
  }

  const startDate = new Date(sortedSnapshots[0].date);
  const endDate = new Date(sortedSnapshots[sortedSnapshots.length - 1].date);
  const totalDays = Math.floor(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;

  let previousHash: string | null = null;
  const snapshotMap = new Map(sortedSnapshots.map(s => [s.date, s]));

  for (let i = 0; i < totalDays; i++) {
    const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = currentDate.toISOString().slice(0, 10);

    if (snapshotMap.has(dateStr)) {
      const snapshot = snapshotMap.get(dateStr)!;
      filledSnapshots.push(snapshot);
      previousHash = snapshot.hash;
    } else if (allowInterpolation) {
      interpolatedDays.push(dateStr);
      const emptySnapshot = createDailySnapshot(dateStr, [], previousHash);
      filledSnapshots.push(emptySnapshot);
      previousHash = emptySnapshot.hash;
    }
  }

  const daysWithGaps = interpolatedDays.length;
  const daysWithData = totalDays - daysWithGaps;

  return {
    window_start: sortedSnapshots[0].date,
    window_end: sortedSnapshots[sortedSnapshots.length - 1].date,
    total_days: totalDays,
    days_with_data: daysWithData,
    days_with_gaps: daysWithGaps,
    daily_snapshots: filledSnapshots,
    category_distribution: categoryDistribution,
    error_class_distribution: aggregateErrorClasses(allRuns),
    escalation_reason_distribution: aggregateEscalationReasons(allRuns),
    workflow_type_distribution: aggregateWorkflowTypes(allRuns),
    interpolated_days: interpolatedDays,
    gap_fill_method: gapFillMethod,
  };
}

export function detectOOD(
  currentMetrics: {
    escalationRate: number;
    failureRate: number;
    oodRate: number;
  },
  baseline: OODDetectionThresholds
): OODDetectionResult {
  const sigma = baseline.sigma_multiplier;

  const escalationThreshold = baseline.baseline_escalation_rate * (1 + sigma);
  const failureThreshold = baseline.baseline_failure_rate * (1 + sigma);
  const oodThreshold = baseline.baseline_ood_rate * (1 + sigma);

  let isOod = false;
  let triggerMetric = '';
  let triggerValue = 0;
  let thresholdValue = 0;

  if (currentMetrics.escalationRate > escalationThreshold) {
    isOod = true;
    triggerMetric = 'escalation_rate';
    triggerValue = currentMetrics.escalationRate;
    thresholdValue = escalationThreshold;
  } else if (currentMetrics.failureRate > failureThreshold) {
    isOod = true;
    triggerMetric = 'failure_rate';
    triggerValue = currentMetrics.failureRate;
    thresholdValue = failureThreshold;
  } else if (currentMetrics.oodRate > oodThreshold) {
    isOod = true;
    triggerMetric = 'ood_rate';
    triggerValue = currentMetrics.oodRate;
    thresholdValue = oodThreshold;
  }

  const confidence = isOod
    ? Math.min(1, triggerValue / (thresholdValue || 0.001))
    : 0;

  return {
    is_ood: isOod,
    confidence,
    trigger_metric: triggerMetric,
    trigger_value: triggerValue,
    threshold_value: thresholdValue,
    baseline_stats: {
      mean: baseline.baseline_escalation_rate,
      std_dev: baseline.baseline_escalation_rate * sigma,
      sample_size: baseline.min_baseline_days,
    },
  };
}

export function createEscalationAlert(
  run: FullAutonomyTelemetryRun,
  severity: 'warning' | 'critical' = 'warning'
): EscalationAlert {
  const reasonMessages: Record<EscalationReason, string> = {
    security_review_required: 'Security review required for workflow',
    schema_violation: 'Schema validation failed',
    threshold_breach: 'Operational threshold breached',
    human_discretion: 'Human intervention requested',
    external_dependency_failure: 'External dependency failure',
    authorization_failure: 'Authorization failure detected',
    none: 'Unknown escalation reason',
  };

  const primaryReason = run.escalation_reasons[0] || 'none';
  const message = reasonMessages[primaryReason];

  return {
    alert_id: `alert-${run.run_id}-${Date.now()}`,
    triggered_at: new Date().toISOString(),
    severity,
    escalation_run_id: run.run_id,
    escalation_reasons: run.escalation_reasons,
    category: run.category,
    workflow_type: run.workflow_type,
    message,
  };
}

export function generateEscalationAlerts(
  runs: FullAutonomyTelemetryRun[],
  options: {
    minEscalations?: number;
    criticalReasons?: EscalationReason[];
  } = {}
): EscalationAlert[] {
  const { minEscalations = 1, criticalReasons = ['security_review_required', 'authorization_failure'] } = options;

  const alerts: EscalationAlert[] = [];

  for (const run of runs) {
    if (run.escalations_count >= minEscalations) {
      const isCritical = run.escalation_reasons.some(r => criticalReasons.includes(r));
      const alert = createEscalationAlert(run, isCritical ? 'critical' : 'warning');
      alerts.push(alert);
    }
  }

  return alerts;
}

export const DEFAULT_OOD_THRESHOLDS: OODDetectionThresholds = {
  baseline_escalation_rate: 0.01,
  baseline_failure_rate: 0.05,
  baseline_ood_rate: 0.01,
  sigma_multiplier: 3.0,
  min_baseline_days: 7,
};

export function categorizeRun(
  run: Omit<FullAutonomyTelemetryRun, 'workflow_type' | 'error_class' | 'escalation_reasons'>,
  options: {
    workflowType?: WorkflowType;
    errorClass?: ErrorClass;
    escalationReasons?: EscalationReason[];
  } = {}
): FullAutonomyTelemetryRun {
  return {
    ...run,
    workflow_type: options.workflowType || 'other',
    error_class: options.errorClass || 'none',
    escalation_reasons: options.escalationReasons || ['none'],
  };
}
