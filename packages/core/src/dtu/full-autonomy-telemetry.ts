import { z } from 'zod';

export interface FullAutonomyTelemetryCategory {
  id: string;
  description: string;
}

export interface FullAutonomyTelemetryRun {
  run_id: string;
  category: string;
  status: 'success' | 'fail';
  escalations_count: number;
  ood_detected: boolean;
  started_at: string;
  ended_at: string;
}

export interface FullAutonomyTelemetrySource {
  schema_version: 'full_autonomy_telemetry_source.v1';
  generated_at: string;
  window: { start: string; end: string };
  maintenance_window_days: number;
  categories: FullAutonomyTelemetryCategory[];
  runs: FullAutonomyTelemetryRun[];
}

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
