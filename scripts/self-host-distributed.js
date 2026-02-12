#!/usr/bin/env node
// FA-006: Distributed execution validation

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildDistributedConsensusReport, buildDistributedExecutionReport } from '../dist/packages/core/src/dtu/distributed-coordination.js';

const DEFAULT_REPORT_PATH = './docs/metrics/reports/distributed-execution-latest.json';
const DEFAULT_CONSENSUS_REPORT_PATH = './docs/metrics/reports/distributed-consensus-latest.json';

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    consensusReport: DEFAULT_CONSENSUS_REPORT_PATH,
    requirePass: false,
    mode: 'both', // 'execution', 'consensus', or 'both'
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--consensus-report' && argv[index + 1]) {
      args.consensusReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--mode' && argv[index + 1]) {
      args.mode = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--require-pass') {
      args.requirePass = true;
    }
  }

  return args;
}

async function runDistributedExecutionValidation(args) {
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

  const report = buildDistributedExecutionReport(scenarios);
  const outputPath = resolve(args.report ?? DEFAULT_REPORT_PATH);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Execution report written to: ${outputPath}`);

  return report;
}

async function runDistributedConsensusValidation(args) {
  console.log('\nFA-006: Distributed Consensus Multi-Instance Testing');
  console.log('=====================================================\n');

  const scenarios = [
    {
      scenario_id: 'leader-election-3-instances',
      description: 'Leader election with 3 instances',
      instances: [
        { id: 'node-1', state: 'follower', term: 0 },
        { id: 'node-2', state: 'follower', term: 0 },
        { id: 'node-3', state: 'follower', term: 0 },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'leader-election' },
      ],
    },
    {
      scenario_id: 'leader-election-5-instances',
      description: 'Leader election with 5 instances (weighted)',
      instances: [
        { id: 'node-1', state: 'follower', term: 0, weight: 3 },
        { id: 'node-2', state: 'follower', term: 0, weight: 2 },
        { id: 'node-3', state: 'follower', term: 0, weight: 1 },
        { id: 'node-4', state: 'follower', term: 0, weight: 1 },
        { id: 'node-5', state: 'follower', term: 0, weight: 1 },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'weighted-leader' },
      ],
    },
    {
      scenario_id: 'network-partition-split-brain',
      description: 'Network partition causing split-brain',
      instances: [
        { id: 'node-1', state: 'leader', term: 1 },
        { id: 'node-2', state: 'follower', term: 1 },
        { id: 'node-3', state: 'leader', term: 1 },
        { id: 'node-4', state: 'follower', term: 1 },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-1', 'node-2'], proposal: 'config-a' },
        { id: 'p2', instance_ids: ['node-3', 'node-4'], proposal: 'config-b' },
      ],
      quorum_size: 2,
    },
    {
      scenario_id: 'quorum-requirements-validation',
      description: 'Validating quorum requirements',
      instances: [
        { id: 'node-1' }, { id: 'node-2' }, { id: 'node-3' },
        { id: 'node-4' }, { id: 'node-5' },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'quorum-pass' },
        { id: 'p2', instance_ids: ['node-4', 'node-5'], proposal: 'quorum-fail' },
      ],
      quorum_size: 3,
    },
    {
      scenario_id: 'leader-failover',
      description: 'Leader failover when leader fails',
      instances: [
        { id: 'node-1', state: 'offline', term: 1 },
        { id: 'node-2', state: 'follower', term: 1 },
        { id: 'node-3', state: 'follower', term: 1 },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-2', 'node-3'], proposal: 'failover-leader' },
      ],
    },
    {
      scenario_id: 'state-consistency-3-instances',
      description: 'State consistency across 3 instances',
      instances: [
        { id: 'node-1', state: 'leader', term: 2 },
        { id: 'node-2', state: 'follower', term: 2 },
        { id: 'node-3', state: 'follower', term: 2 },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'consistent-state' },
      ],
    },
    {
      scenario_id: 'state-consistency-5-instances',
      description: 'State consistency across 5 instances with partition',
      instances: [
        { id: 'node-1', state: 'leader', term: 2 },
        { id: 'node-2', state: 'follower', term: 2 },
        { id: 'node-3', state: 'follower', term: 2 },
        { id: 'node-4', state: 'follower', term: 2 },
        { id: 'node-5', state: 'follower', term: 2 },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'majority-state' },
        { id: 'p2', instance_ids: ['node-4', 'node-5'], proposal: 'minority-state' },
      ],
    },
    {
      scenario_id: 'no-quorum-scenario',
      description: 'No quorum when majority is offline',
      instances: [
        { id: 'node-1', state: 'offline' },
        { id: 'node-2', state: 'offline' },
        { id: 'node-3', state: 'follower' },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-3'], proposal: 'no-quorum' },
      ],
    },
    {
      scenario_id: 'split-brain-same-proposal',
      description: 'Split-brain with same proposal (safe but inefficient)',
      instances: [
        { id: 'node-1', state: 'leader', term: 1 },
        { id: 'node-2', state: 'follower', term: 1 },
        { id: 'node-3', state: 'leader', term: 1 },
        { id: 'node-4', state: 'follower', term: 1 },
      ],
      partitions: [
        { id: 'p1', instance_ids: ['node-1', 'node-2'], proposal: 'same-proposal' },
        { id: 'p2', instance_ids: ['node-3', 'node-4'], proposal: 'same-proposal' },
      ],
      quorum_size: 2,
    },
  ];

  const report = buildDistributedConsensusReport(scenarios);
  const outputPath = resolve(args.consensusReport ?? DEFAULT_CONSENSUS_REPORT_PATH);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Consensus report written to: ${outputPath}`);

  // Print summary
  console.log('\nConsensus Test Summary');
  console.log('----------------------');
  console.log(`Total scenarios: ${report.summary.total_scenarios}`);
  console.log(`Leader election success: ${report.summary.leader_election_success}`);
  console.log(`Split-brain detected: ${report.summary.split_brain_detected}`);
  console.log(`Failover successful: ${report.summary.failover_successful}`);
  console.log(`State consistency achieved: ${report.summary.state_consistency_achieved}`);
  console.log(`No quorum failures: ${report.summary.no_quorum_failures}`);
  console.log(`\nTest Coverage:`);
  console.log(`  Leader election (3+ instances): ${report.test_coverage.leader_election_3plus ? '✓' : '✗'}`);
  console.log(`  Network partition split-brain: ${report.test_coverage.network_partition_split_brain ? '✓' : '✗'}`);
  console.log(`  Quorum requirements: ${report.test_coverage.quorum_requirements ? '✓' : '✗'}`);
  console.log(`  Leader failover: ${report.test_coverage.leader_failover ? '✓' : '✗'}`);
  console.log(`  State consistency: ${report.test_coverage.state_consistency ? '✓' : '✗'}`);
  console.log(`\nFA-006 Status: ${report.fa_006_status.toUpperCase()}`);

  return report;
}

async function main() {
  const args = parseArgs(process.argv);
  let executionReport = null;
  let consensusReport = null;

  if (args.mode === 'execution' || args.mode === 'both') {
    executionReport = await runDistributedExecutionValidation(args);
  }

  if (args.mode === 'consensus' || args.mode === 'both') {
    consensusReport = await runDistributedConsensusValidation(args);
  }

  // Determine overall success
  const executionPassed = executionReport ? executionReport.validation.passed : true;
  const consensusPassed = consensusReport ? consensusReport.validation.passed : true;
  
  if (!executionPassed || !consensusPassed) {
    console.error('\nValidation failed');
    if (args.requirePass) {
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error('Distributed validation failed:', error);
  process.exit(1);
});
