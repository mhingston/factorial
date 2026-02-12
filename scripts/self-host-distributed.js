#!/usr/bin/env node
// FA-006: Distributed execution validation

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildDistributedExecutionReport } from '../dist/packages/core/src/dtu/distributed-coordination.js';

const DEFAULT_REPORT_PATH = './docs/metrics/reports/distributed-execution-latest.json';

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

async function runDistributedValidation() {
  console.log('FA-006: Distributed Execution Validation');
  console.log('========================================\n');

  const scenarios = [
    {
      scenario_id: 'consensus-quorum',
      instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      partitions: [{ id: 'p1', instance_ids: ['a', 'b'], proposal: 'release-1' }],
    },
    {
      scenario_id: 'split-brain',
      instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      partitions: [
        { id: 'p1', instance_ids: ['a', 'b'], proposal: 'release-a' },
        { id: 'p2', instance_ids: ['c', 'd'], proposal: 'release-b' },
      ],
      quorum_size: 2,
    },
    {
      scenario_id: 'no-quorum',
      instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      partitions: [
        { id: 'p1', instance_ids: ['a'], proposal: 'release-a' },
        { id: 'p2', instance_ids: ['b'], proposal: 'release-b' },
      ],
    },
  ];

  const args = parseArgs(process.argv);
  const report = buildDistributedExecutionReport(scenarios);
  const outputPath = resolve(args.report ?? DEFAULT_REPORT_PATH);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Report written to: ${outputPath}`);

  if (!report.validation.passed && args.requirePass) {
    process.exit(1);
  }
}

runDistributedValidation().catch(error => {
  console.error('Distributed validation failed:', error);
  process.exit(1);
});
