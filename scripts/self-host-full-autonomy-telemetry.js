#!/usr/bin/env node
// FA-008: Full autonomy telemetry validation

import { readFile, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildFullAutonomyTelemetryReport,
  validateFullAutonomyTelemetrySource,
} from '../dist/packages/core/src/dtu/full-autonomy-telemetry.js';

const DEFAULT_SOURCE_PATH = './docs/metrics/reports/full-autonomy-telemetry-source-latest.json';
const DEFAULT_REPORT_PATH = './docs/metrics/reports/full-autonomy-telemetry-latest.json';

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE_PATH,
    report: DEFAULT_REPORT_PATH,
    requirePass: false,
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
    if (arg === '--require-pass') {
      args.requirePass = true;
    }
  }

  return args;
}

async function runFullAutonomyTelemetry() {
  console.log('FA-008: Full Autonomy Telemetry');
  console.log('===============================\n');

  const args = parseArgs(process.argv);
  const sourcePath = resolve(args.source);
  const reportPath = resolve(args.report);

  const raw = await readFile(sourcePath, 'utf-8');
  const source = JSON.parse(raw);
  const validation = validateFullAutonomyTelemetrySource(source);
  if (!validation.valid) {
    console.error('Source validation failed:', validation.errors.join('; '));
    if (args.requirePass) {
      process.exit(1);
    }
  }

  const report = buildFullAutonomyTelemetryReport({
    sourcePath: args.source,
    source,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Report written to: ${reportPath}`);

  if (!report.validation.passed && args.requirePass) {
    process.exit(1);
  }
}

runFullAutonomyTelemetry().catch(error => {
  console.error('Full autonomy telemetry validation failed:', error);
  process.exit(1);
});
