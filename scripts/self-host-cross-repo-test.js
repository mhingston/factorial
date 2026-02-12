#!/usr/bin/env node
// FA-007: Cross-repo workflow validation

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildCrossRepoWorkflowReport } from '../dist/packages/core/src/dtu/cross-repo-coordination.js';

const DEFAULT_REPORT_PATH = './docs/metrics/reports/cross-repo-workflow-latest.json';

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

async function runCrossRepoValidation() {
  console.log('FA-007: Cross-Repo Workflow Validation');
  console.log('=======================================\n');

  const scenarios = [
    {
      scenario_id: 'propagation',
      dependencies: [
        { repo: 'repo-a', depends_on: ['repo-b'] },
        { repo: 'repo-b', depends_on: ['repo-c'] },
        { repo: 'repo-c', depends_on: [] },
      ],
      locks: [{ repo: 'repo-c', lock_decision: 'reopen' }],
    },
    {
      scenario_id: 'cycle',
      dependencies: [
        { repo: 'repo-a', depends_on: ['repo-b'] },
        { repo: 'repo-b', depends_on: ['repo-a'] },
      ],
      locks: [],
    },
  ];

  const report = buildCrossRepoWorkflowReport(scenarios);
  const args = parseArgs(process.argv);
  const outputPath = resolve(args.report ?? DEFAULT_REPORT_PATH);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Report written to: ${outputPath}`);

  if (!report.validation.passed && args.requirePass) {
    process.exit(1);
  }
}

runCrossRepoValidation().catch(error => {
  console.error('Cross-repo validation failed:', error);
  process.exit(1);
});
