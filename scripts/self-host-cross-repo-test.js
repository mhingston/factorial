#!/usr/bin/env node
// FA-007: Cross-repo workflow validation - Production Validation Script

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildCrossRepoCoordinationReport } from '../dist/packages/core/src/dtu/cross-repo-coordination.js';

const DEFAULT_REPORT_PATH = './docs/metrics/reports/cross-repo-coordination-latest.json';

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
  console.log('FA-007: Cross-Repository Workflow Validation');
  console.log('=============================================\n');

  // Comprehensive production validation scenarios
  const scenarios = [
    // Scenario 1: Lock propagation through transitive dependencies
    {
      scenario_id: 'transitive-lock-propagation',
      dependencies: [
        { repo: 'repo-a', depends_on: ['repo-b'] },
        { repo: 'repo-b', depends_on: ['repo-c'] },
        { repo: 'repo-c', depends_on: [] },
      ],
      locks: [{ repo: 'repo-c', lock_decision: 'reopen' }],
    },
    
    // Scenario 2: Cycle detection in dependency graph
    {
      scenario_id: 'cycle-detection',
      dependencies: [
        { repo: 'repo-a', depends_on: ['repo-b'] },
        { repo: 'repo-b', depends_on: ['repo-a'] },
      ],
      locks: [],
    },
    
    // Scenario 3: Three-repo chain with Repo A depending on Repo B completion
    {
      scenario_id: 'repo-a-depends-on-b',
      dependencies: [
        { repo: 'downstream', depends_on: ['upstream'] },
        { repo: 'upstream', depends_on: ['base'] },
        { repo: 'base', depends_on: [] },
      ],
      locks: [{ repo: 'base', lock_decision: 'resolved' }],
    },
    
    // Scenario 4: Lock state propagation across repos
    {
      scenario_id: 'lock-state-propagation',
      dependencies: [
        { repo: 'consumer-service', depends_on: ['provider-service'] },
        { repo: 'provider-service', depends_on: ['shared-library'] },
        { repo: 'shared-library', depends_on: [] },
      ],
      locks: [{ repo: 'shared-library', lock_decision: 'reopen' }],
    },
    
    // Scenario 5: Failure handling when dependent repo fails
    {
      scenario_id: 'failure-cascade',
      dependencies: [
        { repo: 'layer-1', depends_on: ['layer-2'] },
        { repo: 'layer-2', depends_on: ['layer-3'] },
        { repo: 'layer-3', depends_on: ['layer-4'] },
        { repo: 'layer-4', depends_on: [] },
      ],
      locks: [],
      execution_states: [
        { repo: 'layer-4', status: 'failed', error: 'Infrastructure failure' },
      ],
    },
    
    // Scenario 6: Rollback coordination across repos
    {
      scenario_id: 'rollback-coordination',
      dependencies: [
        { repo: 'app-tier', depends_on: ['middleware'] },
        { repo: 'middleware', depends_on: ['data-layer'] },
        { repo: 'data-layer', depends_on: [] },
      ],
      locks: [],
      execution_states: [
        { repo: 'data-layer', status: 'completed' },
        { repo: 'middleware', status: 'completed' },
        { repo: 'app-tier', status: 'failed', error: 'Deployment error' },
      ],
      simulate_rollback: true,
    },
    
    // Scenario 7: Network failure between repos
    {
      scenario_id: 'network-failure',
      dependencies: [
        { repo: 'client-repo', depends_on: ['server-repo'] },
        { repo: 'server-repo', depends_on: ['database-repo'] },
        { repo: 'database-repo', depends_on: [] },
      ],
      locks: [],
      simulate_network_failure: ['server-repo'],
    },
    
    // Scenario 8: Diamond dependency pattern
    {
      scenario_id: 'diamond-pattern',
      dependencies: [
        { repo: 'top-level', depends_on: ['left-branch', 'right-branch'] },
        { repo: 'left-branch', depends_on: ['shared-base'] },
        { repo: 'right-branch', depends_on: ['shared-base'] },
        { repo: 'shared-base', depends_on: [] },
      ],
      locks: [{ repo: 'shared-base', lock_decision: 'reopen' }],
    },
    
    // Scenario 9: Five repo complex graph
    {
      scenario_id: 'complex-five-repo',
      dependencies: [
        { repo: 'web-app', depends_on: ['api-service', 'cdn'] },
        { repo: 'api-service', depends_on: ['auth-service', 'cache'] },
        { repo: 'auth-service', depends_on: ['database'] },
        { repo: 'cache', depends_on: ['database'] },
        { repo: 'cdn', depends_on: [] },
        { repo: 'database', depends_on: [] },
      ],
      locks: [{ repo: 'database', lock_decision: 'reopen' }],
    },
    
    // Scenario 10: Multiple network failures
    {
      scenario_id: 'multiple-network-failures',
      dependencies: [
        { repo: 'frontend', depends_on: ['backend'] },
        { repo: 'backend', depends_on: ['primary-db', 'cache-layer'] },
        { repo: 'primary-db', depends_on: [] },
        { repo: 'cache-layer', depends_on: [] },
      ],
      locks: [],
      simulate_network_failure: ['backend', 'cache-layer'],
    },
  ];

  console.log(`Running ${scenarios.length} validation scenarios...\n`);

  const report = buildCrossRepoCoordinationReport(scenarios);
  const args = parseArgs(process.argv);
  const outputPath = resolve(args.report ?? DEFAULT_REPORT_PATH);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  
  console.log('Summary');
  console.log('-------');
  console.log(`Total scenarios: ${report.summary.total_scenarios}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`\nFeature Coverage:`);
  console.log(`  Cycle detection: ${report.summary.cycle_detection_passed ? '✓' : '✗'}`);
  console.log(`  Lock propagation: ${report.summary.lock_propagation_passed ? '✓' : '✗'}`);
  console.log(`  Transitive chains: ${report.summary.transitive_chain_passed ? '✓' : '✗'}`);
  console.log(`  Network failures: ${report.summary.network_failure_handled ? '✓' : '✗'}`);
  console.log(`  Rollback coordination: ${report.summary.rollback_coordination_passed ? '✓' : '✗'}`);
  console.log(`\nValidation checks:`);
  for (const check of report.validation.checks) {
    console.log(`  ${check.passed ? '✓' : '✗'} ${check.name}: ${check.message}`);
  }
  console.log(`\nFA-007 Status: ${report.fa_007_status.toUpperCase()}`);
  console.log(`\nReport written to: ${outputPath}`);

  if (!report.validation.passed && args.requirePass) {
    console.error('\nValidation failed --require-pass is set');
    process.exit(1);
  }
  
  // Exit with error if FA-007 validation fails
  if (report.fa_007_status === 'fail') {
    process.exit(1);
  }
}

runCrossRepoValidation().catch(error => {
  console.error('Cross-repo validation failed:', error);
  process.exit(1);
});
