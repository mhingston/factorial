#!/usr/bin/env node
// FA-003: Self-modification DOT generation validation

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  applyDotModification,
  buildSelfModificationReport,
  generateDotGraph,
  preflightLintDotSource,
} from '../dist/packages/core/src/dtu/dot-generation.js';

const REPORT_PATH = process.argv.includes('--report')
  ? process.argv[process.argv.indexOf('--report') + 1]
  : './docs/metrics/reports/self-modification-latest.json';

const REQUIRE_PASS = process.argv.includes('--require-pass');

const PROVIDER = 'openai';
const MODEL = 'gpt-test';

const workflowSpecs = [
  {
    id: 'SelfModSimple',
    goal: 'Simple codergen pipeline',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      {
        id: 'work',
        shape: 'box',
        type: 'codergen',
        label: 'Work',
        attributes: { llm_provider: PROVIDER, llm_model: MODEL, auto_status: 'true' },
      },
    ],
    edges: [
      { from: 'start', to: 'work' },
      { from: 'work', to: 'exit' },
    ],
  },
  {
    id: 'SelfModQualityGate',
    goal: 'Quality gate routing',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      {
        id: 'gate',
        shape: 'diamond',
        type: 'quality.gate',
        label: 'Gate',
        attributes: {
          gate_type: 'custom',
          gate_command: "printf 'ok'",
          pass_condition: 'outcome=success',
          failure_target: 'fix',
        },
      },
      {
        id: 'fix',
        shape: 'parallelogram',
        type: 'tool',
        label: 'Fix',
        attributes: { tool_command: "printf 'fix'" },
      },
    ],
    edges: [
      { from: 'start', to: 'gate' },
      { from: 'gate', to: 'exit', condition: 'outcome=success', label: 'pass' },
      { from: 'gate', to: 'fix', condition: 'outcome=fail', label: 'fail' },
      { from: 'fix', to: 'exit' },
    ],
  },
  {
    id: 'SelfModConditional',
    goal: 'Conditional routing',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      { id: 'route', shape: 'diamond', type: 'conditional', label: 'Route' },
      {
        id: 'ok',
        shape: 'parallelogram',
        type: 'tool',
        label: 'OK',
        attributes: { tool_command: "printf 'ok'" },
      },
      {
        id: 'fail',
        shape: 'parallelogram',
        type: 'tool',
        label: 'Fail',
        attributes: { tool_command: "printf 'fail'" },
      },
    ],
    edges: [
      { from: 'start', to: 'route' },
      { from: 'route', to: 'ok', condition: 'context.flag=true', label: 'yes' },
      { from: 'route', to: 'fail', condition: 'context.flag=false', label: 'no' },
      { from: 'ok', to: 'exit' },
      { from: 'fail', to: 'exit' },
    ],
  },
  {
    id: 'SelfModConfidenceGate',
    goal: 'Confidence gate routing',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      {
        id: 'confidence',
        shape: 'diamond',
        type: 'confidence.gate',
        label: 'Confidence',
        attributes: { confidence_signal_path: 'confidence.score', escalation_threshold: 0.8 },
      },
      {
        id: 'autonomous',
        shape: 'box',
        type: 'codergen',
        label: 'Autonomous',
        attributes: { llm_provider: PROVIDER, llm_model: MODEL, auto_status: 'true' },
      },
      { id: 'human', shape: 'hexagon', type: 'wait.human', label: 'Human' },
    ],
    edges: [
      { from: 'start', to: 'confidence' },
      { from: 'confidence', to: 'autonomous', label: 'autonomous' },
      { from: 'confidence', to: 'human', label: 'escalate' },
      { from: 'autonomous', to: 'exit' },
      { from: 'human', to: 'exit' },
    ],
  },
  {
    id: 'SelfModParallel',
    goal: 'Parallel fan-in workflow',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      { id: 'parallel', shape: 'component', type: 'parallel', label: 'Parallel' },
      {
        id: 'branch_a',
        shape: 'box',
        type: 'codergen',
        label: 'Branch A',
        attributes: { llm_provider: PROVIDER, llm_model: MODEL, auto_status: 'true' },
      },
      {
        id: 'branch_b',
        shape: 'box',
        type: 'codergen',
        label: 'Branch B',
        attributes: { llm_provider: PROVIDER, llm_model: MODEL, auto_status: 'true' },
      },
      {
        id: 'fan_in',
        shape: 'tripleoctagon',
        type: 'parallel.fan_in',
        label: 'FanIn',
        attributes: { merge_strategy: 'best_score', merge_tiebreak: 'weight' },
      },
    ],
    edges: [
      { from: 'start', to: 'parallel' },
      { from: 'parallel', to: 'branch_a' },
      { from: 'parallel', to: 'branch_b' },
      { from: 'branch_a', to: 'fan_in' },
      { from: 'branch_b', to: 'fan_in' },
      { from: 'fan_in', to: 'exit' },
    ],
  },
  {
    id: 'SelfModManager',
    goal: 'Manager loop workflow',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      {
        id: 'manager',
        shape: 'house',
        type: 'stack.manager_loop',
        label: 'Manager',
        attributes: {
          stack_child_dotfile: './tests/fixtures/reference/simple_example.dot',
          manager_actions: 'observe',
          manager_poll_interval: '0',
          manager_max_cycles: '2',
          manager_require_lock: 'true',
        },
      },
    ],
    edges: [
      { from: 'start', to: 'manager' },
      { from: 'manager', to: 'exit', condition: 'context.stack.manager_loop.last_child_lock=resolved' },
    ],
  },
  {
    id: 'SelfModToolChain',
    goal: 'Tool chain',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      { id: 'plan', shape: 'parallelogram', type: 'tool', label: 'Plan', attributes: { tool_command: "printf 'plan'" } },
      { id: 'work', shape: 'parallelogram', type: 'tool', label: 'Work', attributes: { tool_command: "printf 'work'" } },
    ],
    edges: [
      { from: 'start', to: 'plan' },
      { from: 'plan', to: 'work' },
      { from: 'work', to: 'exit' },
    ],
  },
  {
    id: 'SelfModCodergenContract',
    goal: 'Codergen with output contract',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      {
        id: 'contract',
        shape: 'box',
        type: 'codergen',
        label: 'Contract',
        attributes: {
          llm_provider: PROVIDER,
          llm_model: MODEL,
          auto_status: 'true',
          output_contract_required: 'true',
          output_schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] },
          output_mode: 'json',
        },
      },
    ],
    edges: [
      { from: 'start', to: 'contract' },
      { from: 'contract', to: 'exit' },
    ],
  },
  {
    id: 'SelfModWaitHuman',
    goal: 'Wait.human gate',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      { id: 'human', shape: 'hexagon', type: 'wait.human', label: '[Y] Yes' },
      { id: 'done', shape: 'parallelogram', type: 'tool', label: 'Done', attributes: { tool_command: "printf 'done'" } },
    ],
    edges: [
      { from: 'start', to: 'human' },
      { from: 'human', to: 'done', label: 'yes' },
      { from: 'done', to: 'exit' },
    ],
  },
  {
    id: 'SelfModParallelConsensus',
    goal: 'Parallel consensus fan-in',
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      { id: 'parallel', shape: 'component', type: 'parallel', label: 'Parallel' },
      {
        id: 'branch_a',
        shape: 'box',
        type: 'codergen',
        label: 'Branch A',
        attributes: { llm_provider: PROVIDER, llm_model: MODEL, auto_status: 'true' },
      },
      {
        id: 'branch_b',
        shape: 'box',
        type: 'codergen',
        label: 'Branch B',
        attributes: { llm_provider: PROVIDER, llm_model: MODEL, auto_status: 'true' },
      },
      {
        id: 'branch_c',
        shape: 'box',
        type: 'codergen',
        label: 'Branch C',
        attributes: { llm_provider: PROVIDER, llm_model: MODEL, auto_status: 'true' },
      },
      {
        id: 'fan_in',
        shape: 'tripleoctagon',
        type: 'parallel.fan_in',
        label: 'FanIn',
        attributes: { merge_strategy: 'consensus', merge_tiebreak: 'latest' },
      },
    ],
    edges: [
      { from: 'start', to: 'parallel' },
      { from: 'parallel', to: 'branch_a' },
      { from: 'parallel', to: 'branch_b' },
      { from: 'parallel', to: 'branch_c' },
      { from: 'branch_a', to: 'fan_in' },
      { from: 'branch_b', to: 'fan_in' },
      { from: 'branch_c', to: 'fan_in' },
      { from: 'fan_in', to: 'exit' },
    ],
  },
];

async function runSelfModificationCheck() {
  console.log('FA-003: Self-Modification DOT Generation');
  console.log('=========================================\n');

  const modifications = [];
  let currentDot = generateDotGraph(workflowSpecs[0]);
  let lintResult = preflightLintDotSource(currentDot);

  if (lintResult.errors.length > 0) {
    console.error('Initial DOT generation failed lint checks.');
    process.exit(1);
  }

  modifications.push({
    modification_id: 'mod-1',
    status: 'applied',
    graph_id: workflowSpecs[0].id,
    node_count: lintResult.graph.nodes.size,
    edge_count: lintResult.graph.edges.length,
    error_count: lintResult.errors.length,
    warning_count: lintResult.warnings.length,
    errors: lintResult.errors.map(error => ({
      code: error.code,
      message: error.message,
      node_id: error.nodeId,
      edge: error.edge,
    })),
  });

  for (let index = 1; index < workflowSpecs.length; index += 1) {
    const result = applyDotModification(currentDot, workflowSpecs[index]);
    if (result.status === 'applied') {
      currentDot = result.next_dot;
    }
    modifications.push({
      modification_id: `mod-${index + 1}`,
      status: result.status,
      graph_id: workflowSpecs[index].id,
      node_count: result.graph.nodes.size,
      edge_count: result.graph.edges.length,
      error_count: result.errors.length,
      warning_count: result.warnings.length,
      errors: result.errors.map(error => ({
        code: error.code,
        message: error.message,
        node_id: error.nodeId,
        edge: error.edge,
      })),
    });
  }

  const report = buildSelfModificationReport(modifications);
  const allApplied = report.summary.rolled_back === 0;
  const lintClean = report.summary.lint_errors === 0;
  const sufficientCoverage = modifications.length >= 10;

  const validation = {
    passed: allApplied && lintClean && sufficientCoverage,
    checks: [
      {
        name: 'lint_clean',
        passed: lintClean,
        message: lintClean ? 'No lint errors in generated graphs' : 'Lint errors detected',
      },
      {
        name: 'rollback_unused',
        passed: allApplied,
        message: allApplied ? 'No rollbacks triggered' : 'Rollbacks occurred',
      },
      {
        name: 'workflow_coverage',
        passed: sufficientCoverage,
        message: `Generated ${modifications.length} workflow variants`,
      },
    ],
  };

  const validatedReport = {
    ...report,
    validation,
    fa_003_status: validation.passed ? 'pass' : 'fail',
  };

  const reportPath = resolve(REPORT_PATH);
  writeFileSync(reportPath, JSON.stringify(validatedReport, null, 2));
  console.log(`Report written to: ${reportPath}`);

  if (!validation.passed && REQUIRE_PASS) {
    process.exit(1);
  }
}

runSelfModificationCheck().catch(error => {
  console.error('Self-modification validation failed:', error);
  process.exit(1);
});
