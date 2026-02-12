#!/usr/bin/env node
// FA-004: Configuration optimizer with bounded drift

import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { optimizeConfiguration } from '../dist/packages/core/src/dtu/config-optimizer.js';

const DEFAULT_REPORT_PATH = './docs/metrics/reports/config-optimization-latest.json';

function parseArgs(argv) {
  const args = {
    logsRoot: './logs',
    report: DEFAULT_REPORT_PATH,
    driftLimit: '0.1',
    targetSuccessRate: '0.9',
    targetAutonomyRate: '0.8',
    requirePass: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--logs-root' && argv[index + 1]) {
      args.logsRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--drift-limit' && argv[index + 1]) {
      args.driftLimit = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--target-success-rate' && argv[index + 1]) {
      args.targetSuccessRate = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--target-autonomy-rate' && argv[index + 1]) {
      args.targetAutonomyRate = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--require-pass') {
      args.requirePass = true;
    }
  }

  return args;
}

async function runOptimization() {
  console.log('FA-004: Configuration Optimization');
  console.log('===================================\n');

  const args = parseArgs(process.argv);
  const report = await optimizeConfiguration({
    logs_root: resolve(args.logsRoot),
    drift_limit: Number(args.driftLimit),
    target_success_rate: Number(args.targetSuccessRate),
    target_autonomy_rate: Number(args.targetAutonomyRate),
  });

  const validation = {
    passed: report.summary.optimization_status === 'pass',
    checks: report.checks,
  };

  const validatedReport = {
    ...report,
    validation,
    fa_004_status: validation.passed ? 'pass' : 'fail',
  };

  const reportPath = resolve(args.report);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(validatedReport, null, 2)}\n`, 'utf-8');
  console.log(`Report written to: ${reportPath}`);

  if (!validation.passed && args.requirePass) {
    process.exit(1);
  }
}

runOptimization().catch(error => {
  console.error('Optimization failed:', error);
  process.exit(1);
});
