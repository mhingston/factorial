#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'docs', 'metrics', 'reports', 'confidence-tune-latest.json');
const DEFAULT_TARGET_ESCALATION_RATE = '0.25';
const DEFAULT_MIN_SAMPLES = '5';

function parseArgs(argv) {
  const args = {
    logsRoots: [],
    targetEscalationRate: DEFAULT_TARGET_ESCALATION_RATE,
    minSamples: DEFAULT_MIN_SAMPLES,
    report: DEFAULT_REPORT_PATH,
    windowStart: '',
    windowEnd: '',
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--logs-root') {
      const values = [];
      let cursor = index + 1;
      while (cursor < argv.length && !argv[cursor].startsWith('--')) {
        values.push(argv[cursor]);
        cursor += 1;
      }
      if (values.length === 0) {
        throw new Error('--logs-root requires at least one path');
      }
      args.logsRoots.push(...values);
      index = cursor - 1;
      continue;
    }
    if (arg === '--target-escalation-rate' && argv[index + 1]) {
      args.targetEscalationRate = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--min-samples' && argv[index + 1]) {
      args.minSamples = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--window-start' && argv[index + 1]) {
      args.windowStart = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--window-end' && argv[index + 1]) {
      args.windowEnd = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
      continue;
    }
  }

  return args;
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

function asNonEmptyString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value) {
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

function parseUnitIntervalNumber(value, flag) {
  const parsed = asFiniteNumber(value);
  if (parsed === undefined || parsed < 0 || parsed > 1) {
    throw new Error(`--${flag} must be a number in range [0,1]`);
  }
  return parsed;
}

function parsePositiveInteger(value, flag) {
  const parsed = asFiniteNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${flag} must be an integer >= 1`);
  }
  return parsed;
}

function parseOptionalDate(value, flag) {
  if (!value) {
    return '';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`--${flag} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--${flag} is invalid`);
  }
  return value;
}

async function collectConfidenceResultFiles(logsRoots) {
  const output = [];

  async function walk(currentPath) {
    let entries = [];
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolute = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile() && entry.name === 'confidence_result.json') {
        output.push(absolute);
      }
    }
  }

  for (const root of logsRoots) {
    await walk(root);
  }

  return output.sort((left, right) => left.localeCompare(right));
}

async function loadConfidenceResultRecord(path) {
  const raw = JSON.parse(await readFile(path, 'utf-8'));
  const nodeId = asNonEmptyString(raw.node_id);
  if (!nodeId) {
    throw new Error('Missing node_id');
  }

  const signalPath = asNonEmptyString(raw.confidence_signal_path);
  if (!signalPath) {
    throw new Error('Missing confidence_signal_path');
  }

  const observed = asFiniteNumber(raw.observed_confidence);
  if (observed === undefined) {
    throw new Error('Missing observed_confidence');
  }

  const threshold = asFiniteNumber(raw.escalation_threshold);
  if (threshold === undefined) {
    throw new Error('Missing escalation_threshold');
  }

  const decisionRaw = asNonEmptyString(raw.decision);
  const decision = decisionRaw === 'autonomous' || decisionRaw === 'escalate' ? decisionRaw : null;
  if (!decision) {
    throw new Error('Invalid decision');
  }

  return {
    source_path: path,
    node_id: nodeId,
    confidence_signal_path: signalPath,
    observed_confidence: observed,
    escalation_threshold: threshold,
    decision,
    escalation_target: asNonEmptyString(raw.escalation_target) ?? '',
  };
}

function roundNumber(value, decimals = 6) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function calculateMean(values) {
  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

function calculateQuantile(values, q) {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return values[0];
  }
  const position = (values.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return values[lower];
  }
  const weight = position - lower;
  return values[lower] + (values[upper] - values[lower]) * weight;
}

function summarizeNode({ nodeId, records, targetEscalationRate, minSamples }) {
  const observedValues = records.map(record => record.observed_confidence).sort((left, right) => left - right);
  const thresholdValues = records.map(record => record.escalation_threshold).sort((left, right) => left - right);

  const decisionCounts = {
    autonomous: records.filter(record => record.decision === 'autonomous').length,
    escalate: records.filter(record => record.decision === 'escalate').length,
  };

  const routeCounts = new Map();
  const routeSource = records.some(record => record.decision === 'escalate')
    ? records.filter(record => record.decision === 'escalate')
    : records;
  for (const record of routeSource) {
    if (!record.escalation_target) {
      continue;
    }
    routeCounts.set(record.escalation_target, (routeCounts.get(record.escalation_target) ?? 0) + 1);
  }

  const routeCandidates = [...routeCounts.entries()]
    .map(([target, count]) => ({ target, count }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.target.localeCompare(right.target);
    });

  const currentThresholdMedian = calculateQuantile(thresholdValues, 0.5);
  const recommendedThreshold = calculateQuantile(observedValues, targetEscalationRate);

  return {
    node_id: nodeId,
    sample_count: records.length,
    decision_counts: decisionCounts,
    observed_escalation_rate: roundNumber(decisionCounts.escalate / records.length),
    target_escalation_rate: roundNumber(targetEscalationRate),
    recommendation_status: records.length >= minSamples ? 'ready' : 'insufficient_samples',
    observed_confidence: {
      min: roundNumber(observedValues[0]),
      p50: roundNumber(calculateQuantile(observedValues, 0.5)),
      p90: roundNumber(calculateQuantile(observedValues, 0.9)),
      max: roundNumber(observedValues[observedValues.length - 1]),
      mean: roundNumber(calculateMean(observedValues)),
    },
    threshold_history: {
      min: roundNumber(thresholdValues[0]),
      p50: roundNumber(currentThresholdMedian),
      max: roundNumber(thresholdValues[thresholdValues.length - 1]),
    },
    recommended_threshold: roundNumber(recommendedThreshold),
    threshold_delta: roundNumber(recommendedThreshold - currentThresholdMedian),
    route_candidates: routeCandidates,
    recommended_escalation_target: routeCandidates[0]?.target ?? '',
  };
}

function buildRecommendationReport({
  logsRoots,
  targetEscalationRate,
  minSamples,
  records,
  artifactsScanned,
  invalidArtifacts,
}) {
  const grouped = new Map();
  for (const record of records) {
    const bucket = grouped.get(record.node_id) ?? [];
    bucket.push(record);
    grouped.set(record.node_id, bucket);
  }

  const nodes = [];
  for (const nodeId of [...grouped.keys()].sort((left, right) => left.localeCompare(right))) {
    const nodeRecords = (grouped.get(nodeId) ?? []).sort((left, right) => left.source_path.localeCompare(right.source_path));
    nodes.push(
      summarizeNode({
        nodeId,
        records: nodeRecords,
        targetEscalationRate,
        minSamples,
      }),
    );
  }

  return {
    schema_version: 'confidence_tuning_report.v1',
    generated_at: new Date().toISOString(),
    logs_roots: [...logsRoots],
    target_escalation_rate: roundNumber(targetEscalationRate),
    min_samples: minSamples,
    artifacts_scanned: artifactsScanned,
    artifacts_loaded: records.length,
    artifacts_invalid: invalidArtifacts.length,
    invalid_artifacts: [...invalidArtifacts].sort((left, right) => left.path.localeCompare(right.path)),
    nodes,
  };
}

function buildCheck({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'confidence-publication',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

function buildPublicationReport({ reportPath, logsRoots, targetEscalationRate, minSamples, recommendationReport, window }) {
  const checks = [];
  checks.push(
    buildCheck({
      id: 'CTR-001',
      name: 'Confidence result artifacts were discovered and parsed',
      status: recommendationReport.artifacts_loaded > 0 ? 'pass' : 'fail',
      summary:
        recommendationReport.artifacts_loaded > 0
          ? 'At least one confidence_result artifact was parsed into deterministic recommendations.'
          : 'No valid confidence_result artifacts were parsed from the provided logs roots.',
      evidence: logsRoots.map(path => toContractPath(path)),
      details: {
        artifacts_scanned: recommendationReport.artifacts_scanned,
        artifacts_loaded: recommendationReport.artifacts_loaded,
        artifacts_invalid: recommendationReport.artifacts_invalid,
      },
    }),
  );

  checks.push(
    buildCheck({
      id: 'CTR-002',
      name: 'Recommendation-only publication policy is explicit',
      status: 'pass',
      summary: 'Published recommendations are review inputs only; no automatic threshold mutation path is exposed.',
      evidence: [toContractPath(reportPath)],
      details: {
        recommendation_only: true,
        requires_human_lock_review: true,
        auto_apply_supported: false,
      },
    }),
  );

  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);
  const readyNodes = recommendationReport.nodes.filter(node => node.recommendation_status === 'ready').length;
  const insufficientNodes = recommendationReport.nodes.filter(
    node => node.recommendation_status === 'insufficient_samples',
  ).length;

  return {
    schema_version: 'confidence_tune_publication_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    publication: {
      command: 'npm run confidence:publish',
      deterministic_inputs: logsRoots.map(path => toContractPath(path)),
      cadence: 'periodic',
      window,
      policy: {
        target_escalation_rate: roundNumber(targetEscalationRate),
        min_samples: minSamples,
        recommendation_only: true,
        requires_human_lock_review: true,
        auto_apply_supported: false,
      },
    },
    summary: {
      overall_status: failedCheckIds.length === 0 ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
      operational_mode: 'recommendation-only',
      artifacts_scanned: recommendationReport.artifacts_scanned,
      artifacts_loaded: recommendationReport.artifacts_loaded,
      artifacts_invalid: recommendationReport.artifacts_invalid,
      nodes_ready: readyNodes,
      nodes_insufficient_samples: insufficientNodes,
    },
    checks,
    recommendations: recommendationReport,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const logsRoots = [...new Set(args.logsRoots.map(path => resolve(path)))].sort((left, right) =>
      left.localeCompare(right),
    );
    if (logsRoots.length === 0) {
      throw new Error('confidence publication requires at least one --logs-root');
    }

    const targetEscalationRate = parseUnitIntervalNumber(args.targetEscalationRate, 'target-escalation-rate');
    const minSamples = parsePositiveInteger(args.minSamples, 'min-samples');
    const window = {
      start: parseOptionalDate(args.windowStart, 'window-start'),
      end: parseOptionalDate(args.windowEnd, 'window-end'),
    };
    const reportPath = resolve(args.report);

    const confidenceResultFiles = await collectConfidenceResultFiles(logsRoots);
    const records = [];
    const invalidArtifacts = [];
    for (const path of confidenceResultFiles) {
      try {
        records.push(await loadConfidenceResultRecord(path));
      } catch (error) {
        invalidArtifacts.push({
          path: toContractPath(path),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const recommendationReport = buildRecommendationReport({
      logsRoots: logsRoots.map(path => toContractPath(path)),
      targetEscalationRate,
      minSamples,
      records,
      artifactsScanned: confidenceResultFiles.length,
      invalidArtifacts,
    });
    const publicationReport = buildPublicationReport({
      reportPath,
      logsRoots,
      targetEscalationRate,
      minSamples,
      recommendationReport,
      window,
    });

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(publicationReport, null, 2)}\n`, 'utf-8');
    console.log(`Confidence recommendation publication report written to ${reportPath}`);

    if (args.json) {
      console.log(JSON.stringify(publicationReport, null, 2));
    }

    process.exit(publicationReport.summary.overall_status === 'pass' ? 0 : 1);
  } catch (error) {
    console.error('Confidence recommendation publication failed:', error);
    process.exit(1);
  }
}

main();
