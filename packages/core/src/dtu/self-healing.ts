import { z } from 'zod';

export interface SelfHealingAttempt {
  attempt_id: string;
  failure_class: 'transient' | 'quality_gap' | 'tool_error' | 'spec_mismatch' | 'unknown';
  root_cause: string;
  action: 'retry' | 'alternate_path' | 'reconstruct_state' | 'degrade' | 'escalate';
  status: 'success' | 'fail';
  notes: string[];
}

export interface SelfHealingScenario {
  scenario_id: string;
  attempts: SelfHealingAttempt[];
}

export const selfHealingReportSchema = z.object({
  schema_version: z.literal('self_healing_report.v1'),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_scenarios: z.number().int().nonnegative(),
    total_attempts: z.number().int().nonnegative(),
    successful_attempts: z.number().int().nonnegative(),
    failed_attempts: z.number().int().nonnegative(),
    classifications: z.record(z.number().int().nonnegative()),
    actions: z.record(z.number().int().nonnegative()),
  }),
  scenarios: z.array(
    z.object({
      scenario_id: z.string().min(1),
      status: z.enum(['pass', 'fail']),
      attempts: z.array(
        z.object({
          attempt_id: z.string().min(1),
          failure_class: z.string().min(1),
          root_cause: z.string().min(1),
          action: z.string().min(1),
          status: z.enum(['success', 'fail']),
          notes: z.array(z.string()),
        })
      ),
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
  fa_009_status: z.enum(['pass', 'fail']),
});

export type SelfHealingReport = z.infer<typeof selfHealingReportSchema>;

const DEFAULT_CLASSES = ['transient', 'quality_gap', 'tool_error', 'spec_mismatch', 'unknown'] as const;
const DEFAULT_ACTIONS = ['retry', 'alternate_path', 'reconstruct_state', 'degrade', 'escalate'] as const;

function tally(keys: string[], items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) {
    counts[key] = 0;
  }
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

export function buildSelfHealingReport(scenarios: SelfHealingScenario[]): SelfHealingReport {
  const attempts = scenarios.flatMap(scenario => scenario.attempts);
  const successfulAttempts = attempts.filter(attempt => attempt.status === 'success').length;
  const failedAttempts = attempts.filter(attempt => attempt.status === 'fail').length;
  const classifications = tally([...DEFAULT_CLASSES], attempts.map(attempt => attempt.failure_class));
  const actions = tally([...DEFAULT_ACTIONS], attempts.map(attempt => attempt.action));

  const scenarioSummaries: Array<{
    scenario_id: string;
    status: 'pass' | 'fail';
    attempts: SelfHealingAttempt[];
  }> = scenarios.map(scenario => {
    const scenarioSuccess = scenario.attempts.some(attempt => attempt.status === 'success');
    return {
      scenario_id: scenario.scenario_id,
      status: scenarioSuccess ? 'pass' : 'fail',
      attempts: scenario.attempts,
    };
  });

  const checks: Array<{ id: string; status: 'pass' | 'fail'; summary: string }> = [
    {
      id: 'FA-009-ROOT-CAUSE',
      status: attempts.every(attempt => attempt.root_cause.length > 0) ? 'pass' : 'fail',
      summary: attempts.every(attempt => attempt.root_cause.length > 0)
        ? 'All attempts include root-cause annotations.'
        : 'Missing root-cause annotations detected.',
    },
    {
      id: 'FA-009-ACTIONS',
      status: attempts.some(attempt => attempt.action === 'reconstruct_state') ? 'pass' : 'fail',
      summary: attempts.some(attempt => attempt.action === 'reconstruct_state')
        ? 'State reconstruction actions exercised.'
        : 'No state reconstruction actions found.',
    },
    {
      id: 'FA-009-ALTERNATE',
      status: attempts.some(attempt => attempt.action === 'alternate_path') ? 'pass' : 'fail',
      summary: attempts.some(attempt => attempt.action === 'alternate_path')
        ? 'Alternate path selection exercised.'
        : 'No alternate path selection actions found.',
    },
  ];

  const validationPassed = checks.every(check => check.status === 'pass');

  return {
    schema_version: 'self_healing_report.v1',
    generated_at: new Date().toISOString(),
    summary: {
      total_scenarios: scenarios.length,
      total_attempts: attempts.length,
      successful_attempts: successfulAttempts,
      failed_attempts: failedAttempts,
      classifications,
      actions,
    },
    scenarios: scenarioSummaries,
    validation: {
      passed: validationPassed,
      checks,
    },
    fa_009_status: validationPassed ? 'pass' : 'fail',
  };
}
