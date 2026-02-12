import { z } from 'zod';

export const FULL_AUTONOMY_GATE_IDS = [
  'FA-001',
  'FA-002',
  'FA-003',
  'FA-004',
  'FA-005',
  'FA-006',
  'FA-007',
  'FA-008',
  'FA-009',
] as const;

export type FullAutonomyGateId = typeof FULL_AUTONOMY_GATE_IDS[number];
export type FullAutonomyGateStatus = 'pass' | 'fail' | 'missing';

export interface FullAutonomyReadinessCheck {
  id: FullAutonomyGateId;
  status: FullAutonomyGateStatus;
  summary: string;
  evidence_paths: string[];
  details?: Record<string, unknown>;
}

const fullAutonomyGateIdSchema = z.enum(FULL_AUTONOMY_GATE_IDS);

export const fullAutonomyReadinessReportSchema = z.object({
  schema_version: z.literal('full_autonomy_readiness_report.v1'),
  generated_at: z.string().datetime(),
  report_path: z.string().min(1),
  publication: z
    .object({
      command: z.string().min(1),
      deterministic_inputs: z.array(z.string().min(1)),
    })
    .optional(),
  summary: z.object({
    total_gates: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    overall_status: z.enum(['pass', 'fail']),
    required_gate_ids: z.array(fullAutonomyGateIdSchema),
    passed_gate_ids: z.array(fullAutonomyGateIdSchema),
    failed_gate_ids: z.array(fullAutonomyGateIdSchema),
    missing_gate_ids: z.array(fullAutonomyGateIdSchema),
  }),
  checks: z.array(
    z.object({
      id: fullAutonomyGateIdSchema,
      status: z.enum(['pass', 'fail', 'missing']),
      summary: z.string().min(1),
      evidence_paths: z.array(z.string().min(1)),
      details: z.record(z.unknown()).optional(),
    })
  ),
  readiness_status: z.enum(['pass', 'fail']),
});

export type FullAutonomyReadinessReport = z.infer<typeof fullAutonomyReadinessReportSchema>;

export function buildFullAutonomyReadinessReport(params: {
  reportPath: string;
  checks: FullAutonomyReadinessCheck[];
  publication?: { command: string; deterministic_inputs: string[] };
  generatedAt?: Date;
}): FullAutonomyReadinessReport {
  const reportTime = params.generatedAt ?? new Date();
  const providedChecks = new Map<FullAutonomyGateId, FullAutonomyReadinessCheck>();
  for (const check of params.checks) {
    providedChecks.set(check.id, check);
  }

  const checks: FullAutonomyReadinessCheck[] = FULL_AUTONOMY_GATE_IDS.map(id => {
    return (
      providedChecks.get(id) ?? {
        id,
        status: 'missing',
        summary: 'Missing readiness evidence for required gate.',
        evidence_paths: [],
      }
    );
  });

  const passed = checks.filter(check => check.status === 'pass');
  const failed = checks.filter(check => check.status === 'fail');
  const missing = checks.filter(check => check.status === 'missing');

  const overallStatus = failed.length > 0 || missing.length > 0 ? 'fail' : 'pass';

  return {
    schema_version: 'full_autonomy_readiness_report.v1',
    generated_at: reportTime.toISOString(),
    report_path: params.reportPath,
    publication: params.publication,
    summary: {
      total_gates: checks.length,
      passed: passed.length,
      failed: failed.length,
      missing: missing.length,
      overall_status: overallStatus,
      required_gate_ids: [...FULL_AUTONOMY_GATE_IDS],
      passed_gate_ids: passed.map(check => check.id),
      failed_gate_ids: failed.map(check => check.id),
      missing_gate_ids: missing.map(check => check.id),
    },
    checks,
    readiness_status: overallStatus,
  };
}
