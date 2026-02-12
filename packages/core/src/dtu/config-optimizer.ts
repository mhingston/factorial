import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

export interface ConfigOptimizationOptions {
  logs_root: string;
  drift_limit?: number;
  target_success_rate?: number;
  target_autonomy_rate?: number;
}

interface RunManifestRecord {
  path: string;
  status: string;
  total_tokens: number | null;
  max_restarts: number | null;
}

interface ConfidenceRecord {
  path: string;
  node_id: string;
  observed_confidence: number;
  escalation_threshold: number;
  decision: 'autonomous' | 'escalate';
}

export interface ConfigOptimizationChange {
  key: string;
  before: number | null;
  after: number | null;
  drift_ratio: number;
  within_drift: boolean;
}

type OptimizationCheck = {
  id: string;
  status: 'pass' | 'fail';
  summary: string;
};

export const configOptimizationReportSchema = z.object({
  schema_version: z.literal('config_optimization_report.v1'),
  generated_at: z.string().datetime(),
  logs_root: z.string().min(1),
  drift_limit: z.number().min(0).max(1),
  summary: z.object({
    total_runs: z.number().int().nonnegative(),
    success_rate_before: z.number().min(0).max(1),
    success_rate_after: z.number().min(0).max(1),
    improved_success_rate: z.boolean(),
    drift_violations: z.number().int().nonnegative(),
    optimization_status: z.enum(['pass', 'fail', 'insufficient_data']),
  }),
  baseline: z.object({
    confidence_threshold: z.number().min(0).max(1),
    retry_policy: z.object({
      max_restarts: z.number().int().positive(),
    }),
    budget_limits: z.object({
      max_tokens: z.number().nullable(),
    }),
  }),
  optimized: z.object({
    confidence_threshold: z.number().min(0).max(1),
    retry_policy: z.object({
      max_restarts: z.number().int().positive(),
    }),
    budget_limits: z.object({
      max_tokens: z.number().nullable(),
    }),
  }),
  checks: z.array(
    z.object({
      id: z.string().min(1),
      status: z.enum(['pass', 'fail']),
      summary: z.string().min(1),
    })
  ),
  changes: z.array(
    z.object({
      key: z.string().min(1),
      before: z.number().nullable(),
      after: z.number().nullable(),
      drift_ratio: z.number().min(0),
      within_drift: z.boolean(),
    })
  ),
  evidence: z.object({
    run_manifests: z.array(z.string()),
    confidence_results: z.array(z.string()),
  }),
});

export type ConfigOptimizationReport = z.infer<typeof configOptimizationReportSchema>;

const DEFAULT_DRIFT_LIMIT = 0.1;
const DEFAULT_TARGET_SUCCESS_RATE = 0.9;
const DEFAULT_TARGET_AUTONOMY_RATE = 0.8;
const DEFAULT_MAX_RESTARTS = 50;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function roundRate(value: number): number {
  return Number(value.toFixed(6));
}

function clampWithDrift(before: number, target: number, driftLimit: number): number {
  const maxDelta = Math.abs(before) * driftLimit;
  const delta = target - before;
  if (delta > maxDelta) return before + maxDelta;
  if (delta < -maxDelta) return before - maxDelta;
  return target;
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function listFiles(root: string, filename: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(fullPath, filename)));
    } else if (entry.isFile() && entry.name === filename) {
      results.push(fullPath);
    }
  }
  return results;
}

async function loadRunManifests(logsRoot: string): Promise<RunManifestRecord[]> {
  const manifests = await listFiles(logsRoot, 'run_manifest.json');
  const results: RunManifestRecord[] = [];
  for (const manifestPath of manifests) {
    const raw = JSON.parse(await readFile(manifestPath, 'utf-8')) as Record<string, unknown>;
    const status = asString((raw.outcome as Record<string, unknown> | undefined)?.status) ?? 'UNKNOWN';
    const runConfig = raw.run_config as Record<string, unknown> | undefined;
    const maxRestarts = asNumber(runConfig?.max_restarts ?? null);
    const modelProvenance = Array.isArray(raw.model_provenance) ? raw.model_provenance : [];
    const tokens = modelProvenance
      .map(entry => {
        const usage = isRecord((entry as Record<string, unknown>).usage)
          ? (entry as Record<string, unknown>).usage
          : null;
        return usage ? asNumber((usage as Record<string, unknown>).total_tokens) : undefined;
      })
      .filter((value): value is number => value !== undefined);
    const totalTokens = tokens.length > 0 ? tokens.reduce((sum, value) => sum + value, 0) : null;
    results.push({
      path: manifestPath,
      status,
      total_tokens: totalTokens,
      max_restarts: maxRestarts ?? null,
    });
  }
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

async function loadConfidenceResults(logsRoot: string): Promise<ConfidenceRecord[]> {
  const confidenceFiles = await listFiles(logsRoot, 'confidence_result.json');
  const results: ConfidenceRecord[] = [];
  for (const filePath of confidenceFiles) {
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>;
      const observed = asNumber(raw.observed_confidence);
      const threshold = asNumber(raw.escalation_threshold);
      const decisionRaw = asString(raw.decision);
      const decision = decisionRaw === 'autonomous' || decisionRaw === 'escalate' ? decisionRaw : null;
      const nodeId = asString(raw.node_id);
      if (
        observed === undefined ||
        threshold === undefined ||
        !decision ||
        !nodeId
      ) {
        continue;
      }
      results.push({
        path: filePath,
        node_id: nodeId,
        observed_confidence: observed,
        escalation_threshold: threshold,
        decision,
      });
    } catch {
      continue;
    }
  }
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function summarizeConfidence(records: ConfidenceRecord[], driftLimit: number, targetRate: number) {
  if (records.length === 0) {
    return {
      has_data: false,
      baseline: DEFAULT_CONFIDENCE_THRESHOLD,
      recommended: DEFAULT_CONFIDENCE_THRESHOLD,
      before_rate: 0,
      after_rate: 0,
    };
  }
  const thresholds = records.map(record => record.escalation_threshold);
  const baseline = calculatePercentile(thresholds, 0.5);
  const beforeRate = records.filter(record => record.observed_confidence >= baseline).length / records.length;
  let target = baseline;
  if (beforeRate < targetRate) {
    target = baseline * (1 - driftLimit);
  } else if (beforeRate > targetRate + 0.1) {
    target = baseline * (1 + driftLimit);
  }
  const recommended = Math.min(1, Math.max(0, clampWithDrift(baseline, target, driftLimit)));
  const afterRate = records.filter(record => record.observed_confidence >= recommended).length / records.length;
  return {
    has_data: true,
    baseline: roundRate(baseline),
    recommended: roundRate(recommended),
    before_rate: roundRate(beforeRate),
    after_rate: roundRate(afterRate),
  };
}

function summarizeBudget(records: RunManifestRecord[], driftLimit: number) {
  const tokenTotals = records
    .map(record => record.total_tokens)
    .filter((value): value is number => value !== null);
  if (tokenTotals.length === 0) {
    return {
      has_data: false,
      baseline: null,
      recommended: null,
      before_rate: 0,
      after_rate: 0,
    };
  }
  const baseline = calculatePercentile(tokenTotals, 0.5);
  const target = calculatePercentile(tokenTotals, 0.9);
  const recommended = clampWithDrift(baseline, target, driftLimit);
  const beforeRate = tokenTotals.filter(value => value <= baseline).length / tokenTotals.length;
  const afterRate = tokenTotals.filter(value => value <= recommended).length / tokenTotals.length;
  return {
    has_data: true,
    baseline: Math.round(baseline),
    recommended: Math.round(recommended),
    before_rate: roundRate(beforeRate),
    after_rate: roundRate(afterRate),
  };
}

function summarizeRetries(records: RunManifestRecord[], driftLimit: number, targetRate: number) {
  const maxRestartsValues = records
    .map(record => record.max_restarts)
    .filter((value): value is number => value !== null);
  const baseline =
    maxRestartsValues.length > 0
      ? Math.round(calculatePercentile(maxRestartsValues, 0.5))
      : DEFAULT_MAX_RESTARTS;
  const successRate =
    records.length === 0
      ? 0
      : records.filter(record => record.status === 'SUCCESS').length / records.length;
  let target = baseline;
  if (successRate < targetRate) {
    target = Math.ceil(baseline * (1 + driftLimit));
  } else if (successRate > targetRate + 0.05 && baseline > 1) {
    target = Math.max(1, Math.floor(baseline * (1 - driftLimit)));
  }
  const recommended = Math.max(1, Math.round(clampWithDrift(baseline, target, driftLimit)));
  return {
    baseline,
    recommended,
  };
}

function buildChange(key: string, before: number | null, after: number | null, driftLimit: number): ConfigOptimizationChange {
  if (before === null || after === null || before === 0) {
    return {
      key,
      before,
      after,
      drift_ratio: 0,
      within_drift: true,
    };
  }
  const driftRatio = Math.abs(after - before) / Math.abs(before);
  return {
    key,
    before,
    after,
    drift_ratio: roundRate(driftRatio),
    within_drift: driftRatio <= driftLimit + 1e-9,
  };
}

export async function optimizeConfiguration(
  options: ConfigOptimizationOptions
): Promise<ConfigOptimizationReport> {
  const logsRoot = resolve(options.logs_root);
  const driftLimit = options.drift_limit ?? DEFAULT_DRIFT_LIMIT;
  const targetSuccessRate = options.target_success_rate ?? DEFAULT_TARGET_SUCCESS_RATE;
  const targetAutonomyRate = options.target_autonomy_rate ?? DEFAULT_TARGET_AUTONOMY_RATE;

  const manifests = await loadRunManifests(logsRoot);
  const confidenceResults = await loadConfidenceResults(logsRoot);

  const successRate =
    manifests.length === 0
      ? 0
      : manifests.filter(record => record.status === 'SUCCESS').length / manifests.length;

  const confidenceSummary = summarizeConfidence(confidenceResults, driftLimit, targetAutonomyRate);
  const budgetSummary = summarizeBudget(manifests, driftLimit);
  const retrySummary = summarizeRetries(manifests, driftLimit, targetSuccessRate);

  const beforeRates = [successRate];
  const afterRates = [successRate];
  if (confidenceSummary.has_data) {
    beforeRates.push(confidenceSummary.before_rate);
    afterRates.push(confidenceSummary.after_rate);
  }
  if (budgetSummary.has_data) {
    beforeRates.push(budgetSummary.before_rate);
    afterRates.push(budgetSummary.after_rate);
  }

  const successRateBefore = roundRate(average(beforeRates));
  const successRateAfter = roundRate(average(afterRates));
  const improved = successRateAfter >= successRateBefore;

  const changes: ConfigOptimizationChange[] = [
    buildChange('confidence_threshold', confidenceSummary.baseline, confidenceSummary.recommended, driftLimit),
    buildChange('retry_policy.max_restarts', retrySummary.baseline, retrySummary.recommended, driftLimit),
    buildChange('budget_limits.max_tokens', budgetSummary.baseline, budgetSummary.recommended, driftLimit),
  ];
  const driftViolations = changes.filter(change => !change.within_drift).length;

  const checks: OptimizationCheck[] = [
    {
      id: 'FA-004-DRIFT',
      status: driftViolations === 0 ? 'pass' : 'fail',
      summary:
        driftViolations === 0
          ? 'All optimized parameters stayed within the drift limit.'
          : 'One or more optimized parameters exceeded the drift limit.',
    },
    {
      id: 'FA-004-IMPROVEMENT',
      status: improved ? 'pass' : 'fail',
      summary: improved
        ? 'Optimized configuration maintained or improved projected success rates.'
        : 'Optimized configuration did not improve projected success rates.',
    },
  ];

  const optimizationStatus =
    manifests.length === 0 && confidenceResults.length === 0
      ? 'insufficient_data'
      : driftViolations === 0 && improved
      ? 'pass'
      : 'fail';

  return {
    schema_version: 'config_optimization_report.v1',
    generated_at: new Date().toISOString(),
    logs_root: logsRoot,
    drift_limit: driftLimit,
    summary: {
      total_runs: manifests.length,
      success_rate_before: successRateBefore,
      success_rate_after: successRateAfter,
      improved_success_rate: improved,
      drift_violations: driftViolations,
      optimization_status: optimizationStatus,
    },
    baseline: {
      confidence_threshold: confidenceSummary.baseline || DEFAULT_CONFIDENCE_THRESHOLD,
      retry_policy: {
        max_restarts: retrySummary.baseline,
      },
      budget_limits: {
        max_tokens: budgetSummary.baseline,
      },
    },
    optimized: {
      confidence_threshold: confidenceSummary.recommended || DEFAULT_CONFIDENCE_THRESHOLD,
      retry_policy: {
        max_restarts: retrySummary.recommended,
      },
      budget_limits: {
        max_tokens: budgetSummary.recommended,
      },
    },
    checks,
    changes,
    evidence: {
      run_manifests: manifests.map(record => record.path),
      confidence_results: confidenceResults.map(record => record.path),
    },
  };
}
