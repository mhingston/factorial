import { describe, expect, it } from 'vitest';
import {
  applyDotModification,
  buildSelfModificationReport,
  generateDotGraph,
  preflightLintDotSource,
  type DotGraphSpec,
} from './dot-generation.js';

const PROVIDER = 'openai';
const MODEL = 'gpt-test';

function codergenNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    shape: 'box',
    type: 'codergen',
    label: id,
    attributes: {
      llm_provider: PROVIDER,
      llm_model: MODEL,
      auto_status: 'true',
      ...overrides,
    },
  };
}

function toolNode(id: string, command: string) {
  return {
    id,
    shape: 'parallelogram',
    type: 'tool',
    label: id,
    attributes: {
      tool_command: command,
    },
  };
}

function graphWithEdges(
  id: string,
  nodes: DotGraphSpec['nodes'],
  edges: DotGraphSpec['edges']
): DotGraphSpec {
  return {
    id,
    goal: `goal-${id}`,
    nodes: [
      { id: 'start', shape: 'Mdiamond', label: 'Start' },
      { id: 'exit', shape: 'Msquare', label: 'Exit' },
      ...nodes,
    ],
    edges,
  };
}

function linearGraph(id: string, nodes: DotGraphSpec['nodes']): DotGraphSpec {
  const nodeIds = ['start', ...nodes.map(node => node.id), 'exit'];
  const edges = nodeIds.slice(0, -1).map((from, index) => ({
    from,
    to: nodeIds[index + 1],
  }));
  return graphWithEdges(id, nodes, edges);
}

function buildWorkflowSpecs(): DotGraphSpec[] {
  return [
    linearGraph('SimpleCodergen', [codergenNode('work')]),
    graphWithEdges(
      'QualityGate',
      [
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
        toolNode('fix', "printf 'fix'"),
      ],
      [
        { from: 'start', to: 'gate' },
        { from: 'gate', to: 'exit', condition: 'outcome=success', label: 'pass' },
        { from: 'gate', to: 'fix', condition: 'outcome=fail', label: 'fail' },
        { from: 'fix', to: 'exit' },
      ]
    ),
    graphWithEdges(
      'ConditionalRoute',
      [
        { id: 'route', shape: 'diamond', type: 'conditional', label: 'Route' },
        toolNode('happy', "printf 'ok'"),
        toolNode('sad', "printf 'sad'"),
      ],
      [
        { from: 'start', to: 'route' },
        { from: 'route', to: 'happy', condition: 'context.flag=true', label: 'yes' },
        { from: 'route', to: 'sad', condition: 'context.flag=false', label: 'no' },
        { from: 'happy', to: 'exit' },
        { from: 'sad', to: 'exit' },
      ]
    ),
    graphWithEdges(
      'ConfidenceGate',
      [
        {
          id: 'confidence',
          shape: 'diamond',
          type: 'confidence.gate',
          label: 'Confidence',
          attributes: {
            confidence_signal_path: 'confidence.score',
            escalation_threshold: 0.8,
          },
        },
        codergenNode('autonomous'),
        { id: 'human', shape: 'hexagon', type: 'wait.human', label: 'Human' },
      ],
      [
        { from: 'start', to: 'confidence' },
        { from: 'confidence', to: 'autonomous', label: 'autonomous' },
        { from: 'confidence', to: 'human', label: 'escalate' },
        { from: 'autonomous', to: 'exit' },
        { from: 'human', to: 'exit' },
      ]
    ),
    graphWithEdges(
      'ParallelFanIn',
      [
        { id: 'parallel', shape: 'component', type: 'parallel', label: 'Parallel' },
        codergenNode('branch_a'),
        codergenNode('branch_b'),
        {
          id: 'fan_in',
          shape: 'tripleoctagon',
          type: 'parallel.fan_in',
          label: 'FanIn',
          attributes: {
            merge_strategy: 'best_score',
            merge_tiebreak: 'weight',
          },
        },
      ],
      [
        { from: 'start', to: 'parallel' },
        { from: 'parallel', to: 'branch_a' },
        { from: 'parallel', to: 'branch_b' },
        { from: 'branch_a', to: 'fan_in' },
        { from: 'branch_b', to: 'fan_in' },
        { from: 'fan_in', to: 'exit' },
      ]
    ),
    graphWithEdges(
      'ManagerLoop',
      [
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
      [
        { from: 'start', to: 'manager' },
        { from: 'manager', to: 'exit', condition: 'context.stack.manager_loop.last_child_lock=resolved' },
      ]
    ),
    graphWithEdges('ToolChain', [toolNode('plan', "printf 'plan'"), toolNode('work', "printf 'work'")], [
      { from: 'start', to: 'plan' },
      { from: 'plan', to: 'work' },
      { from: 'work', to: 'exit' },
    ]),
    linearGraph(
      'CodergenContract',
      [
        codergenNode('contract', {
          output_contract_required: 'true',
          output_schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] },
          output_mode: 'json',
          allow_partial: true,
          extra_info: null,
        }),
      ]
    ),
    graphWithEdges(
      'WaitHuman',
      [
        { id: 'human', shape: 'hexagon', type: 'wait.human', label: '[Y] Yes' },
        toolNode('done', "printf 'done'"),
      ],
      [
        { from: 'start', to: 'human' },
        { from: 'human', to: 'done', label: 'yes' },
        { from: 'done', to: 'exit' },
      ]
    ),
    graphWithEdges(
      'ParallelConsensus',
      [
        { id: 'parallel', shape: 'component', type: 'parallel', label: 'Parallel' },
        codergenNode('branch_a'),
        codergenNode('branch_b'),
        codergenNode('branch_c'),
        {
          id: 'fan_in',
          shape: 'tripleoctagon',
          type: 'parallel.fan_in',
          label: 'FanIn',
          attributes: {
            merge_strategy: 'consensus',
            merge_tiebreak: 'latest',
          },
        },
      ],
      [
        { from: 'start', to: 'parallel' },
        { from: 'parallel', to: 'branch_a' },
        { from: 'parallel', to: 'branch_b' },
        { from: 'parallel', to: 'branch_c' },
        { from: 'branch_a', to: 'fan_in' },
        { from: 'branch_b', to: 'fan_in' },
        { from: 'branch_c', to: 'fan_in' },
        { from: 'fan_in', to: 'exit' },
      ]
    ),
  ];
}

describe('dot-generation', () => {
  it('generates DOT graphs that pass preflight lint', () => {
    const specs = buildWorkflowSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(10);
    for (const spec of specs) {
      const dot = generateDotGraph(spec);
      const lint = preflightLintDotSource(dot);
      expect(lint.errors).toEqual([]);
      expect(lint.graph.nodes.size).toBeGreaterThan(0);
    }
  });

  it('rolls back to previous dot on lint failure', () => {
    const validSpec = linearGraph('ValidGraph', [codergenNode('work')]);
    const invalidSpec: DotGraphSpec = {
      id: 'InvalidGraph',
      nodes: [{ id: 'start', shape: 'Mdiamond', label: 'Start' }, codergenNode('work')],
      edges: [{ from: 'start', to: 'work' }],
    };
    const validDot = generateDotGraph(validSpec);
    const result = applyDotModification(validDot, invalidSpec);
    expect(result.status).toBe('rolled_back');
    expect(result.next_dot).toBe(validDot);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rolls back on DOT parse errors', () => {
    const validSpec = linearGraph('ValidGraph', [codergenNode('work')]);
    const invalidSpec: DotGraphSpec = {
      id: 'Invalid Graph',
      nodes: [
        { id: 'start', shape: 'Mdiamond', label: 'Start' },
        { id: 'exit', shape: 'Msquare', label: 'Exit' },
      ],
      edges: [{ from: 'start', to: 'exit' }],
    };
    const validDot = generateDotGraph(validSpec);
    const result = applyDotModification(validDot, invalidSpec);
    expect(result.status).toBe('rolled_back');
    expect(result.errors[0]?.code).toBe('DOT_PARSE_ERROR');
  });

  it('summarizes modification reports', () => {
    const report = buildSelfModificationReport([
      {
        modification_id: 'm1',
        status: 'applied',
        graph_id: 'graph-1',
        node_count: 3,
        edge_count: 2,
        error_count: 0,
        warning_count: 1,
        errors: [],
      },
      {
        modification_id: 'm2',
        status: 'rolled_back',
        graph_id: 'graph-2',
        node_count: 2,
        edge_count: 1,
        error_count: 1,
        warning_count: 0,
        errors: [{ code: 'EXIT_NODE_COUNT', message: 'missing exit' }],
      },
    ]);
    expect(report.summary.total_modifications).toBe(2);
    expect(report.summary.applied).toBe(1);
    expect(report.summary.rolled_back).toBe(1);
    expect(report.summary.lint_errors).toBe(1);
  });
});
