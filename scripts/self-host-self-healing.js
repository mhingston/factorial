#!/usr/bin/env node
// FA-009: Self-healing validation

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildSelfHealingReport } from '../dist/packages/core/src/dtu/self-healing.js';

const DEFAULT_REPORT_PATH = './docs/metrics/reports/self-healing-latest.json';

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    requirePass: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
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

async function runSelfHealingValidation() {
  console.log('FA-009: Self-Healing Validation');
  console.log('===============================\n');

  const scenarios = [
    {
      scenario_id: 'transient-retry',
      attempts: [
        {
          attempt_id: 'a1',
          failure_class: 'transient',
          root_cause: 'network timeout',
          action: 'retry',
          status: 'success',
          notes: ['retry succeeded'],
        },
      ],
    },
    {
      scenario_id: 'reconstruct',
      attempts: [
        {
          attempt_id: 'b1',
          failure_class: 'tool_error',
          root_cause: 'tool output missing fields',
          action: 'reconstruct_state',
          status: 'success',
          notes: ['reconstructed state from checkpoints'],
        },
      ],
    },
    {
      scenario_id: 'alternate-path',
      attempts: [
        {
          attempt_id: 'c1',
          failure_class: 'quality_gap',
          root_cause: 'lint failures after patch',
          action: 'alternate_path',
          status: 'success',
          notes: ['routed to quality-fix path'],
        },
      ],
    },
  ];

  const report = buildSelfHealingReport(scenarios);
  const args = parseArgs(process.argv);
  const reportPath = resolve(args.report);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Report written to: ${reportPath}`);

  if (!report.validation.passed && args.requirePass) {
    process.exit(1);
  }
}

runSelfHealingValidation().catch(error => {
  console.error('Self-healing validation failed:', error);
  process.exit(1);
});
