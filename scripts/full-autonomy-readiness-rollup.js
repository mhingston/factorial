#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FULL_AUTONOMY_GATE_IDS,
  buildFullAutonomyReadinessReport,
} from '../dist/packages/core/src/dtu/full-autonomy-readiness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));
const REPORT_ROOT = process.env.FULL_AUTONOMY_REPORT_ROOT
  ? resolve(process.env.FULL_AUTONOMY_REPORT_ROOT)
  : ROOT_DIR;

const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'full-autonomy-readiness-latest.json',
);

const DEFAULT_EVIDENCE = {
  'FA-001': 'docs/metrics/reports/external-system-operations-latest.json',
  'FA-002': 'docs/metrics/reports/circuit-breaker-tuning-latest.json',
  'FA-003': 'docs/metrics/reports/self-modification-latest.json',
  'FA-004': 'docs/metrics/reports/config-optimization-latest.json',
  'FA-005': 'docs/metrics/reports/codegen-validation-latest.json',
  'FA-006': 'docs/metrics/reports/distributed-consensus-latest.json',
  'FA-007': 'docs/metrics/reports/cross-repo-coordination-latest.json',
  'FA-008': 'docs/metrics/reports/full-autonomy-telemetry-latest.json',
  'FA-009': 'docs/metrics/reports/self-healing-latest.json',
};

const REQUIRED_SCHEMA_VERSION = {
  'FA-001': 'external_system_operations_report.v1',
  'FA-002': 'circuit_breaker_tuning_report.v1',
  'FA-003': 'self_modification_report.v1',
  'FA-004': 'config_optimization_report.v1',
  'FA-005': 'codegen_validation_report.v1',
  'FA-006': 'distributed_consensus_report.v1',
  'FA-007': 'cross_repo_coordination_report.v1',
  'FA-008': 'full_autonomy_telemetry_report.v1',
  'FA-009': 'self_healing_report.v1',
};

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
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

function resolveStatus(check) {
  const statusKey = `${check.id.toLowerCase().replace(/-/g, '_')}_status`;
  const summaryStatus = check.parsed?.summary?.overall_status;
  const statusValue =
    check.parsed?.[statusKey] ??
    check.parsed?.summary?.[statusKey] ??
    summaryStatus;

  if (statusValue === 'pass') {
    return { status: 'pass', detail: statusValue };
  }
  if (statusValue === 'fail') {
    return { status: 'fail', detail: statusValue };
  }
  if (typeof statusValue === 'boolean') {
    return { status: statusValue ? 'pass' : 'fail', detail: statusValue };
  }

  return { status: null, detail: statusValue ?? null };
}

async function buildChecks() {
  const checks = [];

  for (const gateId of FULL_AUTONOMY_GATE_IDS) {
    const relativePath = DEFAULT_EVIDENCE[gateId];
    const absolutePath = resolve(REPORT_ROOT, relativePath);
    const report = await readJsonIfPresent(absolutePath);
    const schemaVersion = report.parsed?.schema_version;
    const expectedSchema = REQUIRED_SCHEMA_VERSION[gateId];
    const schemaOk = schemaVersion === expectedSchema;
    const statusInfo = resolveStatus({ id: gateId, parsed: report.parsed });

    let status = 'missing';
    if (report.exists) {
      if (report.parse_error || !schemaOk) {
        status = 'fail';
      } else if (statusInfo.status) {
        status = statusInfo.status;
      } else {
        status = 'fail';
      }
    }

    const summary = !report.exists
      ? 'Evidence report is missing.'
      : report.parse_error
      ? 'Evidence report is present but not valid JSON.'
      : !schemaOk
      ? `Evidence report schema mismatch (expected ${expectedSchema}).`
      : status === 'pass'
      ? 'Evidence report is present with pass status.'
      : 'Evidence report present but readiness status is not pass.';

    checks.push({
      id: gateId,
      status,
      summary,
      evidence_paths: [relativePath],
      details: {
        exists: report.exists,
        parse_error: report.parse_error,
        schema_version: schemaVersion ?? '',
        expected_schema_version: expectedSchema,
        status_detail: statusInfo.detail,
        status_key: `${gateId.toLowerCase().replace(/-/g, '_')}_status`,
      },
    });
  }

  return checks;
}

function renderReport(report) {
  const lines = [
    '# Full Autonomy Readiness Rollup',
    '',
    `Generated at: ${report.generated_at}`,
    `Overall status: ${report.readiness_status.toUpperCase()}`,
    `Summary: ${report.summary.passed} pass, ${report.summary.failed} fail, ${report.summary.missing} missing`,
    '',
    '## Gate Status',
    '| Gate | Status | Evidence | Summary |',
    '| --- | --- | --- | --- |',
  ];

  for (const item of report.checks) {
    lines.push(
      `| ${item.id} | ${item.status} | ${item.evidence_paths.join(', ')} | ${item.summary} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const reportPath = resolve(args.report);

  const checks = await buildChecks();
  const report = buildFullAutonomyReadinessReport({
    reportPath: toContractPath(reportPath),
    checks,
    publication: {
      command: 'npm run full-autonomy:readiness',
      deterministic_inputs: checks.map(check => check.evidence_paths[0]).filter(Boolean),
    },
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Full autonomy readiness report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderReport(report));
  }

  process.exit(report.readiness_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Full autonomy readiness rollup failed:', error);
  process.exit(1);
});
