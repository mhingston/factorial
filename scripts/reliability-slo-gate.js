#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));
const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'compound-reliability-slo-latest.json',
);
const DEFAULT_WEEKLY_REPORT_DIR = join(ROOT_DIR, 'docs', 'metrics', 'reports');

const DEFAULT_THRESHOLDS = {
  minLockResolutionRate: 0.8,
  maxReopenRatio: 0.2,
  maxCadenceAgeDays: 7,
};

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    weeklyReport: '',
    minLockResolutionRate: String(DEFAULT_THRESHOLDS.minLockResolutionRate),
    maxReopenRatio: String(DEFAULT_THRESHOLDS.maxReopenRatio),
    maxCadenceAgeDays: String(DEFAULT_THRESHOLDS.maxCadenceAgeDays),
    today: '',
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === '--report' || arg === '-o') && next) {
      args.report = next;
      index += 1;
      continue;
    }
    if (arg === '--weekly-report' && next) {
      args.weeklyReport = next;
      index += 1;
      continue;
    }
    if (arg === '--min-lock-resolution-rate' && next) {
      args.minLockResolutionRate = next;
      index += 1;
      continue;
    }
    if (arg === '--max-reopen-ratio' && next) {
      args.maxReopenRatio = next;
      index += 1;
      continue;
    }
    if (arg === '--max-cadence-age-days' && next) {
      args.maxCadenceAgeDays = next;
      index += 1;
      continue;
    }
    if (arg === '--today' && next) {
      args.today = next;
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function parseDate(value, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${flag} is invalid`);
  }
  return parsed;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseUnitIntervalNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flag} must be in range [0,1]`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be an integer >= 0`);
  }
  return parsed;
}

function parseWeeklyHeader(content) {
  const match = content.match(/^Week of (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/m);
  if (!match) {
    throw new Error('Weekly report is missing "Week of YYYY-MM-DD to YYYY-MM-DD" header.');
  }
  return {
    start: match[1],
    end: match[2],
  };
}

function parseMetricLine(content, metricName) {
  const regex = new RegExp(`^-\\s*${escapeRegex(metricName)}:\\s*(.+)$`, 'm');
  const match = content.match(regex);
  if (!match) {
    throw new Error(`Weekly report is missing metric line: ${metricName}`);
  }
  return match[1].trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRateValue(value, metricName) {
  if (/^N\/?A$/i.test(value)) {
    return {
      available: false,
      value: null,
      numerator: 0,
      denominator: 0,
      reason: `${metricName} is N/A`,
    };
  }

  const match = value.match(/^(\d+(?:\.\d+)?)%\s*\((\d+)\/(\d+)\)$/);
  if (!match) {
    throw new Error(`${metricName} must be "NN.N% (x/y)" or "N/A".`);
  }

  const numerator = Number(match[2]);
  const denominator = Number(match[3]);
  if (denominator === 0) {
    return {
      available: false,
      value: null,
      numerator,
      denominator,
      reason: `${metricName} denominator is zero`,
    };
  }

  return {
    available: true,
    value: numerator / denominator,
    numerator,
    denominator,
    reason: '',
  };
}

async function resolveLatestWeeklyReportPath() {
  const entries = await readdir(DEFAULT_WEEKLY_REPORT_DIR, { withFileTypes: true });
  const weeklyReports = entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .map(name => {
      const match = name.match(/^week-(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})\.md$/);
      if (!match) {
        return null;
      }
      return {
        name,
        start: match[1],
        end: match[2],
      };
    })
    .filter(value => value !== null)
    .sort((a, b) => {
      const endCompare = a.end.localeCompare(b.end);
      if (endCompare !== 0) {
        return endCompare;
      }
      return a.start.localeCompare(b.start);
    });

  if (weeklyReports.length === 0) {
    throw new Error(`No weekly report artifacts found in ${DEFAULT_WEEKLY_REPORT_DIR}`);
  }

  return join(DEFAULT_WEEKLY_REPORT_DIR, weeklyReports[weeklyReports.length - 1].name);
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

function daysBetween(startInclusive, endInclusive) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((endInclusive.getTime() - startInclusive.getTime()) / dayMs);
}

function buildCheck({
  id,
  name,
  status,
  summary,
  evidence,
  details,
}) {
  return {
    id,
    status,
    name,
    summary,
    evidence,
    details,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const reportPath = resolve(args.report);
  const weeklyReportPath = args.weeklyReport ? resolve(args.weeklyReport) : await resolveLatestWeeklyReportPath();
  const todayDate = args.today ? parseDate(args.today, '--today') : parseDate(formatDate(new Date()), '--today');

  const thresholds = {
    min_lock_resolution_rate: parseUnitIntervalNumber(
      args.minLockResolutionRate,
      '--min-lock-resolution-rate',
    ),
    max_reopen_ratio: parseUnitIntervalNumber(args.maxReopenRatio, '--max-reopen-ratio'),
    max_cadence_age_days: parseNonNegativeInteger(args.maxCadenceAgeDays, '--max-cadence-age-days'),
  };

  let checks = [];
  let summary = {
    threshold_status: 'fail',
    consensus_lock_decision: 'reopen',
    overall_status: 'fail',
    failed_check_ids: ['SLO-001', 'SLO-002', 'SLO-003'],
  };
  let metrics = {
    lock_resolution_rate: null,
    reopen_ratio: null,
    reopen_count: 0,
    lock_decisions_total: 0,
    review_artifacts_counted: 0,
    cadence_age_days: 0,
  };
  let week = {
    start: '',
    end: '',
  };

  try {
    if (!existsSync(weeklyReportPath)) {
      throw new Error(`Weekly report does not exist: ${weeklyReportPath}`);
    }

    const content = await readFile(weeklyReportPath, 'utf-8');
    week = parseWeeklyHeader(content);
    const reopenRateRaw = parseMetricLine(content, 'reopen_rate');
    const reviewArtifactsRaw = parseMetricLine(content, 'review_artifacts_counted');
    const reopenRate = parseRateValue(reopenRateRaw, 'reopen_rate');
    const reviewArtifactsCount = parseNonNegativeInteger(
      reviewArtifactsRaw,
      'review_artifacts_counted',
    );

    const weekEndDate = parseDate(week.end, 'weekly report end date');
    const cadenceAgeDays = Math.max(0, daysBetween(weekEndDate, todayDate));
    const lockDecisionsTotal = reopenRate.denominator;
    const reopenCount = reopenRate.numerator;
    const reopenRatio = reopenRate.available ? reopenRate.value : null;
    const lockResolutionRate = reopenRate.available ? 1 - reopenRate.value : null;

    const lockResolutionPass =
      lockResolutionRate !== null && lockResolutionRate >= thresholds.min_lock_resolution_rate;
    const reopenRatioPass = reopenRatio !== null && reopenRatio <= thresholds.max_reopen_ratio;
    const cadencePass = cadenceAgeDays <= thresholds.max_cadence_age_days;

    checks = [
      buildCheck({
        id: 'SLO-001',
        name: 'Lock resolution rate minimum',
        status: lockResolutionPass ? 'pass' : 'fail',
        summary: lockResolutionPass
          ? 'Lock resolution rate meets minimum threshold.'
          : 'Lock resolution rate is below threshold or unavailable.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          observed_lock_resolution_rate: lockResolutionRate,
          threshold_min_lock_resolution_rate: thresholds.min_lock_resolution_rate,
          lock_decisions_total: lockDecisionsTotal,
          reopen_count: reopenCount,
          unavailable_reason: reopenRate.reason,
        },
      }),
      buildCheck({
        id: 'SLO-002',
        name: 'Reopen ratio maximum',
        status: reopenRatioPass ? 'pass' : 'fail',
        summary: reopenRatioPass
          ? 'Reopen ratio is within allowed ceiling.'
          : 'Reopen ratio exceeds threshold or is unavailable.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          observed_reopen_ratio: reopenRatio,
          threshold_max_reopen_ratio: thresholds.max_reopen_ratio,
          lock_decisions_total: lockDecisionsTotal,
          reopen_count: reopenCount,
          unavailable_reason: reopenRate.reason,
        },
      }),
      buildCheck({
        id: 'SLO-003',
        name: 'Cadence freshness',
        status: cadencePass ? 'pass' : 'fail',
        summary: cadencePass
          ? 'Weekly metrics artifact freshness is within the allowed window.'
          : 'Weekly metrics artifact is stale beyond allowed cadence age.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          observed_cadence_age_days: cadenceAgeDays,
          threshold_max_cadence_age_days: thresholds.max_cadence_age_days,
          week_end: week.end,
          today: formatDate(todayDate),
        },
      }),
    ];

    const failedThresholdChecks = checks.filter(check => check.status === 'fail').map(check => check.id);
    const thresholdPass = failedThresholdChecks.length === 0;
    const consensusLockDecision = thresholdPass ? 'resolved' : 'reopen';

    checks.push(
      buildCheck({
        id: 'SLO-004',
        name: 'Auto-reopen policy decision hook',
        status: 'pass',
        summary:
          consensusLockDecision === 'resolved'
            ? 'All SLO checks passed; policy hook sets consensus lock to resolved.'
            : 'One or more SLO checks failed; policy hook sets consensus lock to reopen.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          failed_threshold_checks: failedThresholdChecks,
          consensus_lock_decision: consensusLockDecision,
        },
      }),
    );

    summary = {
      threshold_status: thresholdPass ? 'pass' : 'fail',
      consensus_lock_decision: consensusLockDecision,
      overall_status: thresholdPass ? 'pass' : 'fail',
      failed_check_ids: failedThresholdChecks,
    };
    metrics = {
      lock_resolution_rate: lockResolutionRate,
      reopen_ratio: reopenRatio,
      reopen_count: reopenCount,
      lock_decisions_total: lockDecisionsTotal,
      review_artifacts_counted: reviewArtifactsCount,
      cadence_age_days: cadenceAgeDays,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    checks = [
      buildCheck({
        id: 'SLO-001',
        name: 'Lock resolution rate minimum',
        status: 'fail',
        summary: 'Unable to evaluate lock resolution rate due to missing/invalid weekly report input.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          reason,
          threshold_min_lock_resolution_rate: thresholds.min_lock_resolution_rate,
        },
      }),
      buildCheck({
        id: 'SLO-002',
        name: 'Reopen ratio maximum',
        status: 'fail',
        summary: 'Unable to evaluate reopen ratio due to missing/invalid weekly report input.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          reason,
          threshold_max_reopen_ratio: thresholds.max_reopen_ratio,
        },
      }),
      buildCheck({
        id: 'SLO-003',
        name: 'Cadence freshness',
        status: 'fail',
        summary: 'Unable to evaluate cadence freshness due to missing/invalid weekly report input.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          reason,
          threshold_max_cadence_age_days: thresholds.max_cadence_age_days,
        },
      }),
      buildCheck({
        id: 'SLO-004',
        name: 'Auto-reopen policy decision hook',
        status: 'pass',
        summary: 'SLO evaluation input failed closed; policy hook sets consensus lock to reopen.',
        evidence: [toContractPath(weeklyReportPath)],
        details: {
          reason,
          consensus_lock_decision: 'reopen',
        },
      }),
    ];
    summary = {
      threshold_status: 'fail',
      consensus_lock_decision: 'reopen',
      overall_status: 'fail',
      failed_check_ids: ['SLO-001', 'SLO-002', 'SLO-003'],
    };
  }

  const report = {
    schema_version: 'compound_reliability_slo_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    publication: {
      command: 'npm run reliability:slo',
      weekly_report_source: toContractPath(weeklyReportPath),
    },
    inputs: {
      today: formatDate(todayDate),
      week,
    },
    thresholds,
    metrics,
    summary,
    checks,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Reliability SLO report written to ${reportPath}`);
  console.log(`Consensus lock decision: ${report.summary.consensus_lock_decision}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Reliability SLO evaluation failed:', error);
  process.exit(1);
});
