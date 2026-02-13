import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context, Edge, Graph, Handler, Node, Outcome, RunConfig } from '../types/index.js';
import { ExecutionEngine } from './index.js';
import { ExitHandler, StartHandler } from '../handlers/builtin.js';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

class RoutingMockHandler implements Handler {
  private outcomesByNode: Record<string, Outcome>;
  private executed: string[];

  constructor(outcomesByNode: Record<string, Outcome>, executed: string[]) {
    this.outcomesByNode = outcomesByNode;
    this.executed = executed;
  }

  async execute(
    node: Node,
    _context: Context,
    _graph: Graph,
    _logsRoot: string,
    _signal?: AbortSignal
  ): Promise<Outcome> {
    this.executed.push(node.id);
    return this.outcomesByNode[node.id] ?? { status: 'SUCCESS', context_updates: {} };
  }
}

describe('ExecutionEngine targeted retry routing', () => {
  it('routes to retry target based on explicit failure class', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-targeted-retry-class-'));
    const workNode = makeNode('work', 'mock', {
      retry_policy: 'targeted',
      retry_target_transient: 'recover',
    });
    const recoverNode = makeNode('recover', 'mock');
    const graph = makeGraph(
      [makeNode('start', 'start', {}, 'Mdiamond'), workNode, recoverNode, makeNode('exit', 'exit', {}, 'Msquare')],
      [
        { from: 'start', to: 'work', weight: 0, attributes: {} },
        { from: 'work', to: 'exit', weight: 0, attributes: {} },
        { from: 'work', to: 'recover', weight: 0, attributes: {} },
        { from: 'recover', to: 'exit', weight: 0, attributes: {} },
      ]
    );

    const executed: string[] = [];
    const handler = new RoutingMockHandler(
      {
        work: {
          status: 'FAIL',
          failure_reason: 'Request timed out',
          context_updates: { 'failure.class': 'transient' },
        },
        recover: { status: 'SUCCESS', context_updates: {} },
      },
      executed
    );

    const config: RunConfig = { logs_root: logsRoot };
    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('mock', handler);
    registry.register('exit', new ExitHandler());

    const outcome = await engine.run();
    expect(outcome.status).toBe('SUCCESS');
    expect(executed).toContain('work');
    expect(executed).toContain('recover');
  });

  it('classifies tool errors from failure_reason for targeted retries', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-targeted-retry-tool-'));
    const workNode = makeNode('work', 'mock', {
      retry_policy: 'targeted',
      retry_target_tool_error: 'repair',
    });
    const repairNode = makeNode('repair', 'mock');
    const graph = makeGraph(
      [makeNode('start', 'start', {}, 'Mdiamond'), workNode, repairNode, makeNode('exit', 'exit', {}, 'Msquare')],
      [
        { from: 'start', to: 'work', weight: 0, attributes: {} },
        { from: 'work', to: 'exit', weight: 0, attributes: {} },
        { from: 'work', to: 'repair', weight: 0, attributes: {} },
        { from: 'repair', to: 'exit', weight: 0, attributes: {} },
      ]
    );

    const executed: string[] = [];
    const handler = new RoutingMockHandler(
      {
        work: {
          status: 'FAIL',
          failure_reason: 'spawn tool ENOENT',
          context_updates: {},
        },
        repair: { status: 'SUCCESS', context_updates: {} },
      },
      executed
    );

    const config: RunConfig = { logs_root: logsRoot };
    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('mock', handler);
    registry.register('exit', new ExitHandler());

    const outcome = await engine.run();
    expect(outcome.status).toBe('SUCCESS');
    expect(executed).toContain('repair');
  });

  it('classifies quality gaps from failure_reason for targeted retries', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-targeted-retry-quality-'));
    const workNode = makeNode('work', 'mock', {
      retry_policy: 'targeted',
      retry_target_quality_gap: 'improve',
    });
    const improveNode = makeNode('improve', 'mock');
    const graph = makeGraph(
      [makeNode('start', 'start', {}, 'Mdiamond'), workNode, improveNode, makeNode('exit', 'exit', {}, 'Msquare')],
      [
        { from: 'start', to: 'work', weight: 0, attributes: {} },
        { from: 'work', to: 'exit', weight: 0, attributes: {} },
        { from: 'work', to: 'improve', weight: 0, attributes: {} },
        { from: 'improve', to: 'exit', weight: 0, attributes: {} },
      ]
    );

    const executed: string[] = [];
    const handler = new RoutingMockHandler(
      {
        work: {
          status: 'FAIL',
          failure_reason: 'lint failed on changed files',
          context_updates: {},
        },
        improve: { status: 'SUCCESS', context_updates: {} },
      },
      executed
    );

    const config: RunConfig = { logs_root: logsRoot };
    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('mock', handler);
    registry.register('exit', new ExitHandler());

    const outcome = await engine.run();
    expect(outcome.status).toBe('SUCCESS');
    expect(executed).toContain('improve');
  });

  it('routes using retry_target_map for spec mismatches', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-targeted-retry-spec-'));
    const workNode = makeNode('work', 'mock', {
      retry_policy: 'targeted',
      retry_target_map: JSON.stringify({ spec_mismatch: 'align' }),
    });
    const alignNode = makeNode('align', 'mock');
    const graph = makeGraph(
      [makeNode('start', 'start', {}, 'Mdiamond'), workNode, alignNode, makeNode('exit', 'exit', {}, 'Msquare')],
      [
        { from: 'start', to: 'work', weight: 0, attributes: {} },
        { from: 'work', to: 'exit', weight: 0, attributes: {} },
        { from: 'work', to: 'align', weight: 0, attributes: {} },
        { from: 'align', to: 'exit', weight: 0, attributes: {} },
      ]
    );

    const executed: string[] = [];
    const handler = new RoutingMockHandler(
      {
        work: {
          status: 'FAIL',
          failure_reason: 'schema mismatch in output contract',
          context_updates: {},
        },
        align: { status: 'SUCCESS', context_updates: {} },
      },
      executed
    );

    const config: RunConfig = { logs_root: logsRoot };
    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('mock', handler);
    registry.register('exit', new ExitHandler());

    const outcome = await engine.run();
    expect(outcome.status).toBe('SUCCESS');
    expect(executed).toContain('align');
  });
});

function makeNode(
  id: string,
  type: string,
  attributes: Record<string, unknown> = {},
  shape = 'box'
): Node {
  return {
    id,
    type,
    shape,
    label: id,
    max_retries: 0,
    goal_gate: false,
    reasoning_effort: 'high',
    auto_status: false,
    allow_partial: false,
    attributes,
  };
}

function makeGraph(nodes: Node[], edges: Edge[]): Graph {
  return {
    id: 'TargetedRetryGraph',
    default_max_retry: 50,
    nodes: new Map(nodes.map(node => [node.id, node])),
    edges,
    attributes: {},
  };
}
