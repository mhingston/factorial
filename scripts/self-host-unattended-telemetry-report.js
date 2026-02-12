#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_SOURCE_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-unattended-telemetry-source-latest.json',
);
const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-unattended-telemetry-latest.json',
);

const SOURCE_SCHEMA_VERSION = 'self_host_unattended_telemetry_source.v1';
const REPORT_SCHEMA_VERSION = 'self_host_unattended_telemetry_report.v1';
const DEFAULT_MAX_SOURCE_AGE_DAYS = 14;
const DEFAULT_TASK_SMALL_MAX_SCORE = 10;
const DEFAULT_TASK_MEDIUM_MAX_SCORE = 25;
const TOKEN_COST_PROXY_PER_1K = 0.002;
const EXECUTION_COST_PROXY_PER_MINUTE = 0.01;

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE_PATH,
    report: DEFAULT_REPORT_PATH,
    maxSourceAgeDays: String(DEFAULT_MAX_SOURCE_AGE_DAYS),
    today: '',
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--source' || arg === '-s') && argv[index + 1]) {
      args.source = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--max-source-age-days' && argv[index + 1]) {
      args.maxSourceAgeDays = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--today' && argv[index + 1]) {
      args.today = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function parseNonNegativeInteger(value, flagName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be an integer >= 0`);
  }
  return parsed;
}

function parseIsoDate(value, fieldName) {
  const parsed = new Date(String(value));
  if (!value || Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
      value: null,
      error: `${fieldName} must be a valid ISO date/time`,
    };
  }

  return {
    ok: true,
    value: parsed,
    error: '',
  };
}

function parseToday(value) {
  if (!value) {
    return new Date();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--today must be YYYY-MM-DD');
  }

  const parsed = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('--today is invalid');
  }

  return parsed;
}

function daysBetween(start, end) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / dayMs);
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

async function readJsonIfPresent(path) {
  if (!existsSync(path)) {
    return {
      exists: false,
      parsed: null,
      parse_error: '',
    };
  }

  try {
    return {
      exists: true,
      parsed: JSON.parse(await readFile(path, 'utf-8')),
      parse_error: '',
    };
  } catch (error) {
    return {
      exists: true,
      parsed: null,
      parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function asNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function asNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function buildCheck({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'unattended-telemetry',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

function round(value, precision = 6) {
  return Number(Number(value).toFixed(precision));
}

function validateSource(sourceRaw) {
  const errors = [];
  if (!sourceRaw || typeof sourceRaw !== 'object' || Array.isArray(sourceRaw)) {
    return {
      valid: false,
      errors: ['source payload must be a JSON object'],
      normalized: null,
    };
  }

  const schemaVersion = asNonEmptyString(sourceRaw.schema_version);
  if (schemaVersion !== SOURCE_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${SOURCE_SCHEMA_VERSION}`);
  }

  const generatedAtRaw = asNonEmptyString(sourceRaw.generated_at);
  const generatedAtParsed = parseIsoDate(generatedAtRaw, 'generated_at');
  if (!generatedAtParsed.ok) {
    errors.push(generatedAtParsed.error);
  }

  const windowRaw = sourceRaw.window;
  const windowStartRaw = asNonEmptyString(windowRaw?.start);
  const windowEndRaw = asNonEmptyString(windowRaw?.end);
  const windowStartParsed = parseIsoDate(windowStartRaw, 'window.start');
  const windowEndParsed = parseIsoDate(windowEndRaw, 'window.end');
  if (!windowStartParsed.ok) {
    errors.push(windowStartParsed.error);
  }
  if (!windowEndParsed.ok) {
    errors.push(windowEndParsed.error);
  }
  if (windowStartParsed.ok && windowEndParsed.ok && windowEndParsed.value < windowStartParsed.value) {
    errors.push('window.end must be on/after window.start');
  }

  const maintenanceWindowDays = asNonNegativeInteger(sourceRaw.maintenance_window_days);
  if (maintenanceWindowDays === null || maintenanceWindowDays === 0) {
    errors.push('maintenance_window_days must be an integer > 0');
  }

  const mergedPrsRaw = Array.isArray(sourceRaw.merged_prs) ? sourceRaw.merged_prs : null;
  if (!mergedPrsRaw) {
    errors.push('merged_prs must be an array');
  } else if (mergedPrsRaw.length === 0) {
    errors.push('merged_prs must contain at least one item');
  }

  const mergedPrs = [];
  const mergedPrIds = new Set();
  if (mergedPrsRaw) {
    mergedPrsRaw.forEach((entry, index) => {
      const prId = asNonEmptyString(entry?.pr_id);
      if (!prId) {
        errors.push(`merged_prs[${index}].pr_id must be a non-empty string`);
      } else if (mergedPrIds.has(prId)) {
        errors.push(`merged_prs contains duplicate pr_id: ${prId}`);
      } else {
        mergedPrIds.add(prId);
      }

      const mergedAt = parseIsoDate(entry?.merged_at, `merged_prs[${index}].merged_at`);
      if (!mergedAt.ok) {
        errors.push(mergedAt.error);
      }

      if (typeof entry?.reverted_within_window !== 'boolean') {
        errors.push(`merged_prs[${index}].reverted_within_window must be boolean`);
      }

      const churnCommits = asNonNegativeInteger(entry?.churn_commits_within_window);
      if (churnCommits === null) {
        errors.push(`merged_prs[${index}].churn_commits_within_window must be an integer >= 0`);
      }

      mergedPrs.push({
        pr_id: prId,
        merged_at: mergedAt.ok ? mergedAt.value.toISOString() : '',
        reverted_within_window: entry?.reverted_within_window === true,
        churn_commits_within_window: churnCommits ?? 0,
      });
    });
  }

  const runsRaw = Array.isArray(sourceRaw.runs) ? sourceRaw.runs : null;
  if (!runsRaw) {
    errors.push('runs must be an array');
  } else if (runsRaw.length === 0) {
    errors.push('runs must contain at least one item');
  }

  const runs = [];
  if (runsRaw) {
    runsRaw.forEach((entry, index) => {
      const runId = asNonEmptyString(entry?.run_id);
      if (!runId) {
        errors.push(`runs[${index}].run_id must be a non-empty string`);
      }

      const status = asNonEmptyString(entry?.status).toLowerCase();
      if (status !== 'success' && status !== 'fail') {
        errors.push(`runs[${index}].status must be success|fail`);
      }

      const mergedPrId = asNonEmptyString(entry?.merged_pr_id);
      if (mergedPrId && !mergedPrIds.has(mergedPrId)) {
        errors.push(`runs[${index}].merged_pr_id references unknown pr_id: ${mergedPrId}`);
      }

      const changedFiles = asNonNegativeInteger(entry?.changed_files);
      if (changedFiles === null) {
        errors.push(`runs[${index}].changed_files must be an integer >= 0`);
      }

      const changedTestFiles = asNonNegativeInteger(entry?.changed_test_files);
      if (changedTestFiles === null) {
        errors.push(`runs[${index}].changed_test_files must be an integer >= 0`);
      }

      const runtimeMinutes = asNonNegativeNumber(entry?.runtime_minutes);
      if (runtimeMinutes === null) {
        errors.push(`runs[${index}].runtime_minutes must be a number >= 0`);
      }

      const inputTokens = asNonNegativeNumber(entry?.input_tokens);
      if (inputTokens === null) {
        errors.push(`runs[${index}].input_tokens must be a number >= 0`);
      }

      const outputTokens = asNonNegativeNumber(entry?.output_tokens);
      if (outputTokens === null) {
        errors.push(`runs[${index}].output_tokens must be a number >= 0`);
      }

      const executionMinutes = asNonNegativeNumber(entry?.execution_minutes);
      if (executionMinutes === null) {
        errors.push(`runs[${index}].execution_minutes must be a number >= 0`);
      }

      runs.push({
        run_id: runId,
        status,
        merged_pr_id: mergedPrId,
        changed_files: changedFiles ?? 0,
        changed_test_files: changedTestFiles ?? 0,
        runtime_minutes: runtimeMinutes ?? 0,
        input_tokens: inputTokens ?? 0,
        output_tokens: outputTokens ?? 0,
        execution_minutes: executionMinutes ?? 0,
      });
    });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      normalized: null,
    };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      schema_version: schemaVersion,
      generated_at: generatedAtParsed.value.toISOString(),
      window: {
        start: windowStartParsed.value.toISOString(),
        end: windowEndParsed.value.toISOString(),
      },
      maintenance_window_days: maintenanceWindowDays,
      merged_prs: mergedPrs,
      runs,
    },
  };
}

function classifyTaskBucket(run) {
  const score =
    run.changed_files +
    run.changed_test_files * 2 +
    run.runtime_minutes / 5;

  if (score <= DEFAULT_TASK_SMALL_MAX_SCORE) {
    return 'small';
  }
  if (score <= DEFAULT_TASK_MEDIUM_MAX_SCORE) {
    return 'medium';
  }
  return 'large';
}

function computeMetrics(normalizedSource) {
  const totalRuns = normalizedSource.runs.length;
  const successfulRuns = normalizedSource.runs.filter(run => run.status === 'success').length;
  const mergedPrCount = normalizedSource.merged_prs.length;

  const taskDistribution = {
    small: 0,
    medium: 0,
    large: 0,
  };
  for (const run of normalizedSource.runs) {
    taskDistribution[classifyTaskBucket(run)] += 1;
  }

  let tokenCostProxyTotal = 0;
  let executionCostProxyTotal = 0;
  for (const run of normalizedSource.runs) {
    const totalTokens = run.input_tokens + run.output_tokens;
    tokenCostProxyTotal += (totalTokens / 1000) * TOKEN_COST_PROXY_PER_1K;
    executionCostProxyTotal += run.execution_minutes * EXECUTION_COST_PROXY_PER_MINUTE;
  }
  const totalCostProxy = tokenCostProxyTotal + executionCostProxyTotal;

  const revertedPrCount = normalizedSource.merged_prs.filter(pr => pr.reverted_within_window).length;
  const churnedPrCount = normalizedSource.merged_prs.filter(pr => pr.churn_commits_within_window > 0).length;
  const totalChurnCommits = normalizedSource.merged_prs.reduce(
    (acc, pr) => acc + pr.churn_commits_within_window,
    0,
  );

  return {
    total_runs: totalRuns,
    successful_runs: successfulRuns,
    merged_prs: mergedPrCount,
    run_success_rate: totalRuns > 0 ? round(successfulRuns / totalRuns) : null,
    run_to_merge_ratio: mergedPrCount > 0 ? round(totalRuns / mergedPrCount) : null,
    task_distribution: taskDistribution,
    token_cost_proxy_total: round(tokenCostProxyTotal),
    execution_cost_proxy_total: round(executionCostProxyTotal),
    total_cost_proxy: round(totalCostProxy),
    cost_per_merged_pr_proxy: mergedPrCount > 0 ? round(totalCostProxy / mergedPrCount) : null,
    reverted_pr_count: revertedPrCount,
    churned_pr_count: churnedPrCount,
    total_churn_commits: totalChurnCommits,
    revert_rate: mergedPrCount > 0 ? round(revertedPrCount / mergedPrCount) : null,
    churn_pr_rate: mergedPrCount > 0 ? round(churnedPrCount / mergedPrCount) : null,
    average_churn_commits_per_merged_pr: mergedPrCount > 0 ? round(totalChurnCommits / mergedPrCount) : null,
  };
}

function buildReport({
  reportPath,
  sourcePath,
  today,
  maxSourceAgeDays,
  sourceState,
  sourceValidation,
  sourceAgeDays,
  metrics,
}) {
  const schemaPass =
    sourceState.exists &&
    !sourceState.parse_error &&
    sourceValidation.valid;

  const freshnessPass = schemaPass && sourceAgeDays !== null && sourceAgeDays >= 0 && sourceAgeDays <= maxSourceAgeDays;

  const metricsPass =
    schemaPass &&
    metrics !== null &&
    metrics.total_runs > 0 &&
    metrics.merged_prs > 0 &&
    metrics.run_success_rate !== null &&
    metrics.run_to_merge_ratio !== null &&
    metrics.cost_per_merged_pr_proxy !== null &&
    metrics.task_distribution.small + metrics.task_distribution.medium + metrics.task_distribution.large ===
      metrics.total_runs;

  const maintenancePass =
    metricsPass &&
    sourceValidation.normalized.maintenance_window_days > 0 &&
    metrics.revert_rate !== null &&
    metrics.churn_pr_rate !== null &&
    metrics.average_churn_commits_per_merged_pr !== null;

  const checks = [
    buildCheck({
      id: 'UT-001',
      name: 'Source schema and required fields',
      status: schemaPass ? 'pass' : 'fail',
      summary: schemaPass
        ? 'Source artifact is present, parseable, and schema-compliant.'
        : 'Source artifact is missing, malformed, or schema-invalid.',
      evidence: [toContractPath(sourcePath)],
      details: {
        source_exists: sourceState.exists,
        source_parse_error: sourceState.parse_error,
        expected_schema_version: SOURCE_SCHEMA_VERSION,
        observed_schema_version: sourceState.parsed?.schema_version ?? '',
        validation_errors: sourceValidation.errors,
      },
    }),
    buildCheck({
      id: 'UT-002',
      name: 'Source freshness requirement',
      status: freshnessPass ? 'pass' : 'fail',
      summary: freshnessPass
        ? 'Source generated_at is within freshness SLA.'
        : 'Source generated_at is stale, missing, or in the future.',
      evidence: [toContractPath(sourcePath)],
      details: {
        today: today.toISOString().slice(0, 10),
        source_generated_at: sourceValidation.normalized?.generated_at ?? '',
        source_age_days: sourceAgeDays,
        max_source_age_days: maxSourceAgeDays,
      },
    }),
    buildCheck({
      id: 'UT-003',
      name: 'Required outcome/economics metrics completeness',
      status: metricsPass ? 'pass' : 'fail',
      summary: metricsPass
        ? 'Required unattended outcome/economics metrics are computed and complete.'
        : 'Required unattended outcome/economics metrics are missing or incomplete.',
      evidence: [toContractPath(sourcePath)],
      details: {
        total_runs: metrics?.total_runs ?? 0,
        successful_runs: metrics?.successful_runs ?? 0,
        merged_prs: metrics?.merged_prs ?? 0,
        run_success_rate: metrics?.run_success_rate ?? null,
        run_to_merge_ratio: metrics?.run_to_merge_ratio ?? null,
        cost_per_merged_pr_proxy: metrics?.cost_per_merged_pr_proxy ?? null,
        task_distribution: metrics?.task_distribution ?? { small: 0, medium: 0, large: 0 },
      },
    }),
    buildCheck({
      id: 'UT-004',
      name: 'Post-merge maintenance indicator completeness',
      status: maintenancePass ? 'pass' : 'fail',
      summary: maintenancePass
        ? 'Revert and churn indicators are computed for bounded maintenance window.'
        : 'Revert/churn indicators are missing or maintenance window is invalid.',
      evidence: [toContractPath(sourcePath)],
      details: {
        maintenance_window_days: sourceValidation.normalized?.maintenance_window_days ?? 0,
        reverted_pr_count: metrics?.reverted_pr_count ?? 0,
        churned_pr_count: metrics?.churned_pr_count ?? 0,
        revert_rate: metrics?.revert_rate ?? null,
        churn_pr_rate: metrics?.churn_pr_rate ?? null,
        average_churn_commits_per_merged_pr: metrics?.average_churn_commits_per_merged_pr ?? null,
      },
    }),
  ];

  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);
  const overallStatus = failedCheckIds.length === 0 ? 'pass' : 'fail';

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    publication: {
      command: 'npm run self-host:unattended-telemetry',
      deterministic_inputs: [toContractPath(sourcePath)],
      freshness_requirements: {
        source_schema_version: SOURCE_SCHEMA_VERSION,
        max_source_age_days: maxSourceAgeDays,
      },
      cost_proxy_model: {
        token_cost_proxy_per_1k_tokens: TOKEN_COST_PROXY_PER_1K,
        execution_cost_proxy_per_minute: EXECUTION_COST_PROXY_PER_MINUTE,
      },
      task_bucket_model: {
        small_max_score: DEFAULT_TASK_SMALL_MAX_SCORE,
        medium_max_score: DEFAULT_TASK_MEDIUM_MAX_SCORE,
        score_formula: 'changed_files + (changed_test_files * 2) + (runtime_minutes / 5)',
      },
    },
    source: {
      path: toContractPath(sourcePath),
      schema_version: sourceValidation.normalized?.schema_version ?? '',
      generated_at: sourceValidation.normalized?.generated_at ?? '',
      window: sourceValidation.normalized?.window ?? { start: '', end: '' },
      maintenance_window_days: sourceValidation.normalized?.maintenance_window_days ?? 0,
      age_days: sourceAgeDays,
    },
    metrics: metrics ?? {
      total_runs: 0,
      successful_runs: 0,
      merged_prs: 0,
      run_success_rate: null,
      run_to_merge_ratio: null,
      task_distribution: { small: 0, medium: 0, large: 0 },
      token_cost_proxy_total: 0,
      execution_cost_proxy_total: 0,
      total_cost_proxy: 0,
      cost_per_merged_pr_proxy: null,
      reverted_pr_count: 0,
      churned_pr_count: 0,
      total_churn_commits: 0,
      revert_rate: null,
      churn_pr_rate: null,
      average_churn_commits_per_merged_pr: null,
    },
    summary: {
      overall_status: overallStatus,
      failed_check_ids: failedCheckIds,
      total_runs: metrics?.total_runs ?? 0,
      successful_runs: metrics?.successful_runs ?? 0,
      merged_prs: metrics?.merged_prs ?? 0,
      run_success_rate: metrics?.run_success_rate ?? null,
      run_to_merge_ratio: metrics?.run_to_merge_ratio ?? null,
      cost_per_merged_pr_proxy: metrics?.cost_per_merged_pr_proxy ?? null,
      revert_rate: metrics?.revert_rate ?? null,
      churn_pr_rate: metrics?.churn_pr_rate ?? null,
      average_churn_commits_per_merged_pr: metrics?.average_churn_commits_per_merged_pr ?? null,
      task_distribution: metrics?.task_distribution ?? { small: 0, medium: 0, large: 0 },
    },
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const sourcePath = resolve(args.source);
  const reportPath = resolve(args.report);
  const maxSourceAgeDays = parseNonNegativeInteger(args.maxSourceAgeDays, '--max-source-age-days');
  const today = parseToday(args.today);

  const sourceState = await readJsonIfPresent(sourcePath);
  const sourceValidation = validateSource(sourceState.parsed);

  const sourceGeneratedAt = parseIsoDate(sourceValidation.normalized?.generated_at, 'source.generated_at');
  const sourceAgeDays =
    sourceValidation.valid && sourceGeneratedAt.ok ? daysBetween(sourceGeneratedAt.value, today) : null;

  const metrics = sourceValidation.valid ? computeMetrics(sourceValidation.normalized) : null;
  const report = buildReport({
    reportPath,
    sourcePath,
    today,
    maxSourceAgeDays,
    sourceState,
    sourceValidation,
    sourceAgeDays,
    metrics,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`Self-host unattended telemetry report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Self-host unattended telemetry report generation failed:', error);
  process.exit(1);
});
