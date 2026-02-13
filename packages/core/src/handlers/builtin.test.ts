import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '../context/index.js';
import { ExecutionCancelledError, ExecutionEngine } from '../engine/index.js';
import type { Graph, Node, Edge, RunConfig, Handler, Outcome } from '../types/index.js';
import {
  ConfidenceGateHandler,
  FailureAnalyzeHandler,
  FanInHandler,
  JudgeRubricHandler,
  ManagerLoopHandler,
  ParallelHandler,
  QualityGateHandler,
} from './builtin.js';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

class MockHandler implements Handler {
  private executed: string[];
  private statusById: Record<string, Outcome['status']>;

  constructor(executed: string[], statusById: Record<string, Outcome['status']>) {
    this.executed = executed;
    this.statusById = statusById;
  }

  async execute(node: Node, _context: Context, _graph: Graph, _logsRoot: string, _signal?: AbortSignal): Promise<Outcome> {
    this.executed.push(node.id);
    return {
      status: this.statusById[node.id] ?? 'SUCCESS',
      context_updates: {},
    };
  }
}

describe('ParallelHandler', () => {
  it('skips queued branches after first success', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-parallel-'));

    const parallelNode: Node = {
      id: 'parallel',
      type: 'parallel',
      shape: 'component',
      label: 'parallel',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        join_policy: 'first_success',
        max_parallel: '1',
      },
    };

    const branch1: Node = {
      id: 'branch1',
      type: 'mock',
      shape: 'box',
      label: 'branch1',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {},
    };

    const branch2: Node = {
      id: 'branch2',
      type: 'mock',
      shape: 'box',
      label: 'branch2',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {},
    };

    const exitNode: Node = {
      id: 'exit',
      type: 'exit',
      shape: 'Msquare',
      label: 'exit',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {},
    };

    const nodes = new Map<string, Node>([
      [parallelNode.id, parallelNode],
      [branch1.id, branch1],
      [branch2.id, branch2],
      [exitNode.id, exitNode],
    ]);

    const edges: Edge[] = [
      { from: 'parallel', to: 'branch1', weight: 0, attributes: {} },
      { from: 'parallel', to: 'branch2', weight: 0, attributes: {} },
      { from: 'branch1', to: 'exit', weight: 0, attributes: {} },
      { from: 'branch2', to: 'exit', weight: 0, attributes: {} },
    ];

    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const config: RunConfig = { logs_root: logsRoot };
    const engine = new ExecutionEngine(graph, config);
    const executed: string[] = [];
    engine.getHandlerRegistry().register('mock', new MockHandler(executed, { branch1: 'SUCCESS' }));

    const handler = new ParallelHandler(engine);
    const context = new Context();
    const outcome = await handler.execute(parallelNode, context, graph, logsRoot);

    const resultsJson = await context.getString('parallel.results');
    const results = JSON.parse(resultsJson || '[]') as Array<{ branch_id: string; status: string }>;

    const branch2Result = results.find(result => result.branch_id === 'branch2');

    expect(outcome.status).toBe('SUCCESS');
    expect(executed).toEqual(['branch1']);
    expect(branch2Result?.status).toBe('SKIPPED');
  });
});

describe('ParallelHandler cancellation', () => {
  it('returns skipped when branch is aborted', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-cancel-'));

    const parallelNode: Node = {
      id: 'parallel',
      type: 'parallel',
      shape: 'component',
      label: 'parallel',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        join_policy: 'first_success',
        max_parallel: '2',
      },
    };

    const branch1: Node = {
      id: 'branch1',
      type: 'mock',
      shape: 'box',
      label: 'branch1',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {},
    };

    const branch2: Node = {
      id: 'branch2',
      type: 'mock',
      shape: 'box',
      label: 'branch2',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {},
    };

    const exitNode: Node = {
      id: 'exit',
      type: 'exit',
      shape: 'Msquare',
      label: 'exit',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {},
    };

    const nodes = new Map<string, Node>([
      [parallelNode.id, parallelNode],
      [branch1.id, branch1],
      [branch2.id, branch2],
      [exitNode.id, exitNode],
    ]);

    const edges: Edge[] = [
      { from: 'parallel', to: 'branch1', weight: 0, attributes: {} },
      { from: 'parallel', to: 'branch2', weight: 0, attributes: {} },
      { from: 'branch1', to: 'exit', weight: 0, attributes: {} },
      { from: 'branch2', to: 'exit', weight: 0, attributes: {} },
    ];

    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const config: RunConfig = { logs_root: logsRoot };
    const engine = new ExecutionEngine(graph, config);
    const executed: string[] = [];

    class AbortableHandler implements Handler {
      async execute(node: Node, _context: Context, _graph: Graph, _logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
        executed.push(node.id);
        if (node.id === 'branch1') {
          return { status: 'SUCCESS', context_updates: {} };
        }
        const aborted = await waitForAbort(signal, 50);
        if (aborted) {
          throw new ExecutionCancelledError();
        }
        return { status: 'SUCCESS', context_updates: {} };
      }
    }

    engine.getHandlerRegistry().register('mock', new AbortableHandler());
    const handler = new ParallelHandler(engine);
    const context = new Context();
    const outcome = await handler.execute(parallelNode, context, graph, logsRoot);

    const resultsJson = await context.getString('parallel.results');
    const results = JSON.parse(resultsJson || '[]') as Array<{ branch_id: string; status: string }>;
    const branch2Result = results.find(result => result.branch_id === 'branch2');

    expect(outcome.status).toBe('SUCCESS');
    expect(new Set(executed)).toEqual(new Set(['branch1', 'branch2']));
    expect(branch2Result?.status).toBe('SKIPPED');
  });
});

describe('FanInHandler', () => {
  it('selects best candidate deterministically with weight tie-break and writes artifact', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-fan-in-'));
    const fanInNode: Node = {
      id: 'fan_in',
      type: 'parallel.fan_in',
      shape: 'tripleoctagon',
      label: 'fan_in',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        merge_strategy: 'best_score',
        merge_tiebreak: 'weight',
      },
    };

    const context = new Context();
    await context.set(
      'parallel.results',
      JSON.stringify([
        { branch_id: 'alpha', status: 'SUCCESS', score: 0.8, branch_weight: 1, result_index: 0, output: { pick: 'alpha' } },
        { branch_id: 'beta', status: 'SUCCESS', score: 0.8, branch_weight: 3, result_index: 1, output: { pick: 'beta' } },
      ])
    );

    const handler = new FanInHandler();
    const outcome = await handler.execute(fanInNode, context, makeGraphWithNode(fanInNode), logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates['parallel.fan_in.selected_id']).toBe('beta');
    expect(outcome.context_updates['parallel.fan_in.selected_output']).toEqual({ pick: 'beta' });

    const artifactPath = String(outcome.context_updates['parallel.fan_in.artifact_path'] || '');
    const artifact = JSON.parse(await readFile(artifactPath, 'utf-8')) as Record<string, unknown>;
    expect(artifact.merge_strategy).toBe('best_score');
    expect((artifact.selected as Record<string, unknown>).branch_id).toBe('beta');
  });

  it('selects consensus output and records consensus count', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-fan-in-consensus-'));
    const fanInNode: Node = {
      id: 'fan_in',
      type: 'parallel.fan_in',
      shape: 'tripleoctagon',
      label: 'fan_in',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        merge_strategy: 'consensus',
        merge_tiebreak: 'lexical',
      },
    };

    const context = new Context();
    await context.set(
      'parallel.results',
      JSON.stringify([
        { branch_id: 'b', status: 'SUCCESS', score: 0.6, result_index: 1, output: { plan: 'A' } },
        { branch_id: 'a', status: 'SUCCESS', score: 0.9, result_index: 0, output: { plan: 'A' } },
        { branch_id: 'c', status: 'SUCCESS', score: 0.95, result_index: 2, output: { plan: 'B' } },
      ])
    );

    const handler = new FanInHandler();
    const outcome = await handler.execute(fanInNode, context, makeGraphWithNode(fanInNode), logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates['parallel.fan_in.selected_id']).toBe('a');
    expect(outcome.context_updates['parallel.fan_in.selected_output']).toEqual({ plan: 'A' });
    expect(outcome.context_updates['parallel.fan_in.consensus_count']).toBe(2);
  });

  it('fails when arbiter strategy is configured without arbiter_prompt', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-fan-in-arbiter-'));
    const fanInNode: Node = {
      id: 'fan_in',
      type: 'parallel.fan_in',
      shape: 'tripleoctagon',
      label: 'fan_in',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        merge_strategy: 'arbiter',
      },
    };

    const context = new Context();
    await context.set(
      'parallel.results',
      JSON.stringify([{ branch_id: 'a', status: 'SUCCESS', score: 1, result_index: 0 }])
    );

    const handler = new FanInHandler();
    const outcome = await handler.execute(fanInNode, context, makeGraphWithNode(fanInNode), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('arbiter_prompt');
  });
});

describe('QualityGateHandler', () => {
  it('executes canonical tests gate and emits artifacts', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-quality-gate-'));
    const gateNode: Node = {
      id: 'gate',
      type: 'quality.gate',
      shape: 'diamond',
      label: 'gate',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        gate_type: 'tests',
        gate_command: `printf 'gate-ok'`,
      },
    };

    const handler = new QualityGateHandler();
    const outcome = await handler.execute(gateNode, new Context(), makeGraphWithNode(gateNode), logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates['quality.gate.gate.raw_outcome']).toBe('pass');
    expect(outcome.context_updates['quality.gate.gate.normalized_outcome']).toBe('pass');

    const resultPath = String(outcome.context_updates['quality.gate.gate.result_path'] || '');
    const result = JSON.parse(await readFile(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(result.normalized_outcome).toBe('pass');
  });

  it('fails gate when pass_condition does not match and suggests failure_target', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-quality-gate-fail-'));
    const gateNode: Node = {
      id: 'gate',
      type: 'quality.gate',
      shape: 'diamond',
      label: 'gate',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        gate_type: 'custom',
        gate_command: `printf 'ok'`,
        pass_condition: 'context.quality.gate.gate.raw_outcome=fail',
        failure_target: 'fix',
      },
    };

    const handler = new QualityGateHandler();
    const outcome = await handler.execute(gateNode, new Context(), makeGraphWithNode(gateNode), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.suggested_next_ids).toEqual(['fix']);
    expect(outcome.context_updates['quality.gate.gate.normalized_outcome']).toBe('fail');
  });
});

describe('ConfidenceGateHandler', () => {
  it('routes autonomous path when confidence meets threshold', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-confidence-gate-auto-'));
    const node: Node = {
      id: 'confidence',
      type: 'confidence.gate',
      shape: 'diamond',
      label: 'confidence',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        confidence_signal_path: 'confidence.score',
        escalation_threshold: 0.8,
      },
    };

    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes: new Map<string, Node>([
        [node.id, node],
        [
          'autonomous',
          {
            id: 'autonomous',
            type: 'tool',
            shape: 'parallelogram',
            label: 'autonomous',
            max_retries: 0,
            goal_gate: false,
            reasoning_effort: 'high',
            auto_status: false,
            allow_partial: false,
            attributes: {},
          },
        ],
        [
          'human',
          {
            id: 'human',
            type: 'wait.human',
            shape: 'hexagon',
            label: 'human',
            max_retries: 0,
            goal_gate: false,
            reasoning_effort: 'high',
            auto_status: false,
            allow_partial: false,
            attributes: {},
          },
        ],
      ]),
      edges: [
        { from: 'confidence', to: 'autonomous', label: 'autonomous', weight: 0, attributes: {} },
        { from: 'confidence', to: 'human', label: 'escalate', weight: 0, attributes: {} },
      ],
      attributes: {},
    };

    const context = new Context();
    await context.set('confidence.score', 0.92);
    const handler = new ConfidenceGateHandler();
    const outcome = await handler.execute(node, context, graph, logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.preferred_label).toBe('autonomous');
    expect(outcome.suggested_next_ids).toBeUndefined();
    expect(outcome.context_updates['confidence.confidence.decision']).toBe('autonomous');
    const artifactPath = String(outcome.context_updates['confidence.confidence.result_path'] || '');
    const artifact = JSON.parse(await readFile(artifactPath, 'utf-8')) as Record<string, unknown>;
    expect(artifact.decision).toBe('autonomous');
  });

  it('escalates to wait.human when confidence is below threshold', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-confidence-gate-escalate-'));
    const node: Node = {
      id: 'confidence',
      type: 'confidence.gate',
      shape: 'diamond',
      label: 'confidence',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        confidence_signal_path: 'confidence.score',
        escalation_threshold: 0.8,
      },
    };

    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes: new Map<string, Node>([
        [node.id, node],
        [
          'autonomous',
          {
            id: 'autonomous',
            type: 'tool',
            shape: 'parallelogram',
            label: 'autonomous',
            max_retries: 0,
            goal_gate: false,
            reasoning_effort: 'high',
            auto_status: false,
            allow_partial: false,
            attributes: {},
          },
        ],
        [
          'human',
          {
            id: 'human',
            type: 'wait.human',
            shape: 'hexagon',
            label: 'human',
            max_retries: 0,
            goal_gate: false,
            reasoning_effort: 'high',
            auto_status: false,
            allow_partial: false,
            attributes: {},
          },
        ],
      ]),
      edges: [
        { from: 'confidence', to: 'autonomous', label: 'autonomous', weight: 0, attributes: {} },
        { from: 'confidence', to: 'human', label: 'escalate', weight: 0, attributes: {} },
      ],
      attributes: {},
    };

    const context = new Context();
    await context.set('confidence.score', 0.3);
    const handler = new ConfidenceGateHandler();
    const outcome = await handler.execute(node, context, graph, logsRoot);

    expect(outcome.status).toBe('PARTIAL_SUCCESS');
    expect(outcome.preferred_label).toBe('escalate');
    expect(outcome.suggested_next_ids).toEqual(['human']);
    expect(outcome.context_updates['confidence.confidence.decision']).toBe('escalate');
    expect(outcome.context_updates['confidence.confidence.escalation_target']).toBe('human');
  });
});

describe('JudgeRubricHandler', () => {
  it('passes when overall score meets threshold', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-judge-pass-'));
    const rubricPath = join(logsRoot, 'rubric.md');
    await writeFile(rubricPath, '# Rubric\n- accuracy\n- completeness\n');

    const node: Node = {
      id: 'judge',
      type: 'judge.rubric',
      shape: 'box',
      label: 'judge',
      prompt: 'Judge this implementation.',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: true,
      allow_partial: false,
      llm_provider: 'openai',
      llm_model: 'gpt-test',
      attributes: {
        llm_backend: 'cli',
        cli_command: `printf '{"overall_score":0.92,"sub_scores":{"accuracy":0.9},"rationale":"solid"}'`,
        judge_rubric_path: rubricPath,
        score_threshold: 0.85,
        score_weights: '{"accuracy":1}',
      },
    };

    const handler = new JudgeRubricHandler();
    const outcome = await handler.execute(node, new Context(), makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.preferred_label).toBe('pass');
    expect(outcome.context_updates['judge.judge.score']).toBe(0.92);
    expect(outcome.context_updates['judge.judge.score_threshold']).toBe(0.85);
    expect(outcome.context_updates['judge.judge.passed']).toBe(true);
    expect(outcome.context_updates['judge.judge.rubric_path']).toBe(rubricPath);
    expect(outcome.context_updates['judge.judge.score_weights']).toEqual({ accuracy: 1 });
    expect(outcome.notes).toContain('score 0.92 >= threshold 0.85');
  });

  it('fails when overall score is below threshold', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-judge-fail-'));
    const rubricPath = join(logsRoot, 'rubric.md');
    await writeFile(rubricPath, '# Rubric\n- quality\n');

    const node: Node = {
      id: 'judge',
      type: 'judge.rubric',
      shape: 'box',
      label: 'judge',
      prompt: 'Judge this implementation.',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: true,
      allow_partial: false,
      llm_provider: 'openai',
      llm_model: 'gpt-test',
      attributes: {
        llm_backend: 'cli',
        cli_command: `printf '{"overall_score":0.41,"sub_scores":{"quality":0.4},"rationale":"needs work"}'`,
        judge_rubric_path: rubricPath,
        score_threshold: 0.85,
      },
    };

    const handler = new JudgeRubricHandler();
    const outcome = await handler.execute(node, new Context(), makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.preferred_label).toBe('revise');
    expect(outcome.failure_reason).toContain('below threshold');
    expect(outcome.context_updates['judge.judge.passed']).toBe(false);
  });
});

describe('FailureAnalyzeHandler', () => {
  it('classifies failure class and emits retry context updates', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-failure-analyze-'));
    const node: Node = {
      id: 'failure_analyze',
      type: 'failure.analyze',
      shape: 'box',
      label: 'failure_analyze',
      prompt: 'Classify this failure.',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: true,
      allow_partial: false,
      llm_provider: 'openai',
      llm_model: 'gpt-test',
      attributes: {
        llm_backend: 'cli',
        cli_command:
          `printf '{"failure_class":"transient","summary":"network timeout","recommendation":"retry later"}'`,
      },
    };

    const context = new Context();
    await context.set('failure_reason', 'ETIMEDOUT contacting upstream service');
    const handler = new FailureAnalyzeHandler();
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates['failure.class']).toBe('transient');
    expect(outcome.context_updates['retry.class']).toBe('transient');
    expect(outcome.context_updates['failure.analyze.failure_analyze.summary']).toBe('network timeout');
  });

  it('fails when failure_class is invalid', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-failure-analyze-invalid-'));
    const node: Node = {
      id: 'failure_analyze',
      type: 'failure.analyze',
      shape: 'box',
      label: 'failure_analyze',
      prompt: 'Classify this failure.',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: true,
      allow_partial: false,
      llm_provider: 'openai',
      llm_model: 'gpt-test',
      attributes: {
        llm_backend: 'cli',
        cli_command: `printf '{"failure_class":"unknown","summary":"invalid"}'`,
      },
    };

    const handler = new FailureAnalyzeHandler();
    const outcome = await handler.execute(node, new Context(), makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('failure_class');
  });
});

describe('ManagerLoopHandler', () => {
  it('delegates child request, writes artifact, and succeeds when child completes', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-success-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'delegate,observe',
        manager_poll_interval: '0',
        manager_max_cycles: '2',
      },
    };

    const context = new Context();
    await context.set('stack.child.status', 'completed');
    await context.set('stack.child.outcome', 'success');
    await context.set('stack.child.lock_decision', 'resolved');
    const handler = new ManagerLoopHandler();
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates['stack.manager_loop.delegated']).toBe(true);
    expect(await context.getString('stack.child.dotfile')).toBe('./workflows/child.dot');
    const request = await context.get<Record<string, unknown>>('stack.child.request');
    expect(request?.manager_node_id).toBe('manager');

    const artifactPath = String(outcome.context_updates['stack.manager_loop.artifact_path'] ?? '');
    expect(artifactPath).toContain('manager_loop.json');
    const artifact = JSON.parse(await readFile(artifactPath, 'utf-8')) as Record<string, unknown>;
    expect(artifact.final_status).toBe('SUCCESS');
    expect(artifact.cycle_count).toBe(1);
    expect(artifact.require_lock_decision).toBe(false);
    expect((artifact.actions as unknown[])).toContain('delegate');
    const cycles = artifact.cycles as Array<Record<string, unknown>>;
    expect(cycles[0]?.child_status).toBe('completed');
    expect(cycles[0]?.child_lock_valid).toBe(true);
  });

  it('supports custom stop condition evaluation', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-stop-condition-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'observe',
        manager_poll_interval: '0',
        manager_max_cycles: '3',
        manager_stop_condition: 'context.child_status=running && context.cycle=1',
      },
    };

    const context = new Context();
    await context.set('stack.child.status', 'running');
    await context.set('stack.child.outcome', 'partial_success');
    const handler = new ManagerLoopHandler();
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('PARTIAL_SUCCESS');
    expect(outcome.notes).toContain('stop condition satisfied');
  });

  it('fails when max cycles are exceeded', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-timeout-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'observe',
        manager_poll_interval: '0',
        manager_max_cycles: '2',
      },
    };

    const context = new Context();
    await context.set('stack.child.status', 'running');
    const handler = new ManagerLoopHandler();
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('Max cycles exceeded');
    expect(outcome.context_updates['stack.manager_loop.cycle_count']).toBe(2);
  });

  it('fails when lock decision is required but missing', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-lock-required-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'observe',
        manager_poll_interval: '0',
        manager_max_cycles: '2',
        manager_require_lock: 'true',
      },
    };

    const context = new Context();
    await context.set('stack.child.status', 'completed');
    await context.set('stack.child.outcome', 'success');
    const handler = new ManagerLoopHandler();
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('required but missing');
  });

  it('fails when lock decision is reopen', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-lock-reopen-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'observe',
        manager_poll_interval: '0',
        manager_max_cycles: '2',
        manager_require_lock: 'true',
      },
    };

    const context = new Context();
    await context.set('stack.child.status', 'completed');
    await context.set('stack.child.outcome', 'success');
    await context.set('stack.child.lock_decision', 'reopen');
    const handler = new ManagerLoopHandler();
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('reopen');
    expect(outcome.context_updates['stack.manager_loop.lock_decision']).toBe('reopen');
  });

  it('fails when lock decision value is invalid', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-lock-invalid-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'observe',
        manager_poll_interval: '0',
        manager_max_cycles: '2',
      },
    };

    const context = new Context();
    await context.set('stack.child.status', 'completed');
    await context.set('stack.child.outcome', 'success');
    await context.set('stack.child.lock_decision', 'ship-it');
    const handler = new ManagerLoopHandler();
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('Expected resolved or reopen');
  });

  it('runs local child execution adapter when enabled', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-local-child-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'delegate,observe',
        manager_poll_interval: '0',
        manager_max_cycles: '2',
        manager_local_child_execution: 'true',
      },
    };

    const context = new Context();
    const handler = new ManagerLoopHandler({
      childExecutionAdapter: async () => ({
        child_status: 'completed',
        child_outcome: 'success',
        child_lock_decision: 'resolved',
        context_updates: {
          'stack.child.summary': 'adapter executed',
        },
        notes: 'local child adapter completed',
      }),
    });
    const outcome = await handler.execute(node, context, makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates['stack.manager_loop.local_child_execution']).toBe(true);
    expect(await context.getString('stack.child.status')).toBe('completed');
    expect(await context.getString('stack.child.outcome')).toBe('success');
    expect(await context.getString('stack.child.lock_decision')).toBe('resolved');
    expect(await context.getString('stack.child.summary')).toBe('adapter executed');
    expect(outcome.notes).toContain('local child adapter completed');
  });

  it('fails fast when local child execution is enabled without adapter', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-manager-loop-local-child-missing-'));
    const node: Node = {
      id: 'manager',
      type: 'stack.manager_loop',
      shape: 'house',
      label: 'manager',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'high',
      auto_status: false,
      allow_partial: false,
      attributes: {
        stack_child_dotfile: './workflows/child.dot',
        manager_actions: 'delegate,observe',
        manager_poll_interval: '0',
        manager_max_cycles: '2',
        manager_local_child_execution: 'true',
      },
    };

    const handler = new ManagerLoopHandler();
    const outcome = await handler.execute(node, new Context(), makeGraphWithNode(node), logsRoot);

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('childExecutionAdapter');
  });
});

async function waitForAbort(signal: AbortSignal | undefined, timeoutMs: number): Promise<boolean> {
  if (!signal) {
    await new Promise(resolve => setTimeout(resolve, timeoutMs));
    return false;
  }
  if (signal.aborted) return true;

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onAbort = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort);
  });
}

function makeGraphWithNode(node: Node): Graph {
  return {
    id: 'G',
    default_max_retry: 50,
    nodes: new Map([[node.id, node]]),
    edges: [],
    attributes: {},
  };
}
