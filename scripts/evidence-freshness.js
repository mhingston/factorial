#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_ARTIFACTS = [
  {
    path: 'docs/metrics/reports/external-system-operations-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/circuit-breaker-tuning-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/self-modification-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/config-optimization-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/codegen-validation-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/distributed-consensus-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/cross-repo-coordination-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/full-autonomy-telemetry-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/self-healing-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/full-autonomy-readiness-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/self-host-provider-backed-latest.json',
    max_age_hours: 168,
    required: true,
  },
  {
    path: 'docs/metrics/reports/self-host-autonomous-latest.json',
    max_age_hours: 168,
    required: false,
  },
  {
    path: 'docs/metrics/reports/self-host-agent-audit-latest.json',
    max_age_hours: 168,
    required: false,
  },
  {
    path: 'docs/metrics/reports/compound-reliability-slo-latest.json',
    max_age_hours: 168,
    required: true,
  },
];

function parseArgs(argv) {
  const args = {
    maxAgeHours: 168,
    artifact: '',
    report: '',
    json: false,
    checkDrift: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--max-age-hours' || arg === '-a') && argv[index + 1]) {
      args.maxAgeHours = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if ((arg === '--artifact' || arg === '-f') && argv[index + 1]) {
      args.artifact = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--check-drift') {
      args.checkDrift = true;
      continue;
    }
    if (arg === '--json' || arg === '-j') {
      args.json = true;
    }
  }

  return args;
}

function getFileAgeHours(filePath) {
  try {
    const stats = statSync(filePath);
    const now = Date.now();
    const mtime = stats.mtime.getTime();
    const ageMs = now - mtime;
    return ageMs / (1000 * 60 * 60);
  } catch {
    return null;
  }
}

function formatAge(ageHours) {
  if (ageHours === null) return 'unknown';
  if (ageHours < 1) return `${Math.round(ageHours * 60)} minutes`;
  if (ageHours < 24) return `${Math.round(ageHours)} hours`;
  return `${Math.round(ageHours / 24)} days`;
}

function validateJsonSchema(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      valid: true,
      hasSchemaVersion: !!parsed.schema_version,
      schemaVersion: parsed.schema_version || null,
    };
  } catch (error) {
    return {
      valid: false,
      hasSchemaVersion: false,
      schemaVersion: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkFreshness(filePath, maxAgeHours) {
  const fullPath = resolve(ROOT_DIR, filePath);
  const exists = existsSync(fullPath);

  if (!exists) {
    return {
      artifact_path: filePath,
      last_modified: null,
      age_hours: null,
      max_age_hours: maxAgeHours,
      status: 'missing',
      recommended_action: `Create artifact at ${filePath}`,
      schema_valid: false,
      schema_version: null,
    };
  }

  const ageHours = getFileAgeHours(fullPath);
  const schemaValidation = validateJsonSchema(fullPath);
  const isFresh = ageHours !== null && ageHours < maxAgeHours;

  let status;
  let recommendedAction;

  if (!schemaValidation.valid) {
    status = 'stale';
    recommendedAction = `Fix JSON schema error: ${schemaValidation.error}`;
  } else if (!isFresh) {
    status = 'stale';
    recommendedAction = `Regenerate artifact (age: ${formatAge(ageHours)}, max: ${formatAge(maxAgeHours)})`;
  } else {
    status = 'fresh';
    recommendedAction = 'No action needed';
  }

  const stats = statSync(fullPath);

  return {
    artifact_path: filePath,
    last_modified: stats.mtime.toISOString(),
    age_hours: ageHours !== null ? Math.round(ageHours * 100) / 100 : null,
    max_age_hours: maxAgeHours,
    status,
    recommended_action: recommendedAction,
    schema_valid: schemaValidation.valid,
    schema_version: schemaValidation.schemaVersion,
  };
}

async function generateFreshnessReport(options) {
  const reports = [];

  if (options.artifact) {
    const result = await checkFreshness(options.artifact, options.maxAgeHours);
    reports.push(result);
  } else {
    for (const artifact of DEFAULT_ARTIFACTS) {
      const result = await checkFreshness(artifact.path, artifact.max_age_hours);
      reports.push(result);
    }
  }

  const staleCount = reports.filter(r => r.status === 'stale').length;
  const missingCount = reports.filter(r => r.status === 'missing').length;
  const freshCount = reports.filter(r => r.status === 'fresh').length;

  let overallStatus;
  if (missingCount > 0 || staleCount > 0) {
    overallStatus = 'critical';
  } else if (staleCount > 0) {
    overallStatus = 'warning';
  } else {
    overallStatus = 'healthy';
  }

  return {
    schema_version: 'evidence_freshness_report.v1',
    generated_at: new Date().toISOString(),
    reports,
    summary: {
      total: reports.length,
      fresh: freshCount,
      stale: staleCount,
      missing: missingCount,
    },
    overall_status: overallStatus,
  };
}

function renderFreshnessReport(report) {
  const lines = [
    '# Evidence Freshness Report',
    '',
    `Generated at: ${report.generated_at}`,
    `Overall status: ${report.overall_status.toUpperCase()}`,
    `Summary: ${report.summary.fresh} fresh, ${report.summary.stale} stale, ${report.summary.missing} missing`,
    '',
    '## Artifact Status',
    '| Artifact | Status | Age | Max Age | Schema | Action |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const item of report.reports) {
    const age = item.age_hours !== null ? formatAge(item.age_hours) : 'N/A';
    const maxAge = formatAge(item.max_age_hours);
    const schema = item.schema_valid ? (item.schema_version || 'valid') : 'invalid';
    lines.push(
      `| ${item.artifact_path} | ${item.status} | ${age} | ${maxAge} | ${schema} | ${item.recommended_action} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.checkDrift) {
    console.error('Drift detection not yet implemented');
    process.exit(1);
  }

  const report = await generateFreshnessReport(args);

  if (args.report) {
    const reportPath = resolve(args.report);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Freshness report written to ${reportPath}`);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderFreshnessReport(report));
  }

  const hasIssues = report.reports.some(
    r => r.status === 'stale' || r.status === 'missing'
  );

  process.exit(hasIssues ? 1 : 0);
}

main().catch(error => {
  console.error('Evidence freshness check failed:', error);
  process.exit(1);
});
