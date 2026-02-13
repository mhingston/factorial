import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context, Edge, Graph, Handler, Node, Outcome, RunConfig } from '../types/index.js';
import { ExecutionEngine } from './index.js';
import { ExitHandler, StartHandler } from '../handlers/builtin.js';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

class BudgetMockHandler implements Handler {
  private outcomesByNode: Record<string, Outcome>;
  private delaysMsByNode: Record<string, number>;
  private executed: string[];

  constructor(
    outcomesByNode: Record<string, Outcome>,
    executed: string[],
    delaysMsByNode: Record<string, number> = {}
  ) {
    this.outcomesByNode = outcomesByNode;
    this.executed = executed;
    this.delaysMsByNode = delaysMsByNode;
  }

  async execute(
    node: Node,
    _context: Context,
    _graph: Graph,
    _logsRoot: string,
    _signal?: AbortSignal
  ): Promise<Outcome> {
    this.executed.push(node.id);
    const delayMs = this.delaysMsByNode[node.id] ?? 0;
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    return this.outcomesByNode[node.id] ?? { status: 'SUCCESS', context_updates: {} };
  }
}

describe('ExecutionEngine budget controls', () => {
  it('fails fast when graph budget_max_tokens is exceeded', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-budget-run-tokens-'));
    const graph = makeGraph(
      [
        makeNode('start', 'start', {}, 'Mdiamond'),
        makeNode('build_a', 'mock'),
        makeNode('build_b', 'mock'),
        makeNode('exit', 'exit', {}, 'Msquare'),
      ],
      [
        { from: 'start', to: 'build_a', weight: 0, attributes: {} },
        { from: 'build_a', to: 'build_b', weight: 0, attributes: {} },
        { from: 'build_b', to: 'exit', weight: 0, attributes: {} },
      ],
      {
        budget_max_tokens: 100,
      }
    );

    const executed: string[] = [];
    const handler = new BudgetMockHandler(
      {
        build_a: {
          status: 'SUCCESS',
          context_updates: {
            'budget.build_a.tokens_used': 60,
          },
        },
        build_b: {
          status: 'SUCCESS',
          context_updates: {
            'budget.build_b.tokens_used': 60,
          },
        },
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
    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('graph.budget_max_tokens exceeded');
    expect(executed).toEqual(['build_a', 'build_b']);

    const runBudget = (await readJson(join(logsRoot, 'budget_usage.json'))) as Record<string, unknown>;
    const totals = runBudget.totals as Record<string, unknown>;
    expect(totals.tokens_used).toBe(120);
    expect(runBudget.breached).toBe(true);

    const nodeBudget = (await readJson(join(logsRoot, 'build_b', 'budget_result.json'))) as Record<
      string,
      unknown
    >;
    expect(nodeBudget.breached).toBe(true);
    expect(nodeBudget.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('graph.budget_max_tokens exceeded')])
    );
  });

  it('enforces node timeout as a duration budget ceiling', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-budget-node-timeout-'));
    const graph = makeGraph(
      [
        makeNode('start', 'start', {}, 'Mdiamond'),
        makeNode('work', 'mock', {}, 'box', 10),
        makeNode('exit', 'exit', {}, 'Msquare'),
      ],
      [
        { from: 'start', to: 'work', weight: 0, attributes: {} },
        { from: 'work', to: 'exit', weight: 0, attributes: {} },
      ]
    );

    const executed: string[] = [];
    const handler = new BudgetMockHandler(
      {
        work: {
          status: 'SUCCESS',
          context_updates: {},
        },
      },
      executed,
      {
        work: 40,
      }
    );

    const config: RunConfig = { logs_root: logsRoot };
    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('mock', handler);
    registry.register('exit', new ExitHandler());

    const outcome = await engine.run();
    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('node.timeout exceeded');
    expect(executed).toEqual(['work']);

    const nodeBudget = (await readJson(join(logsRoot, 'work', 'budget_result.json'))) as Record<string, unknown>;
    const usage = nodeBudget.usage as Record<string, unknown>;
    expect(Number(usage.duration_ms)).toBeGreaterThan(10);
    expect(nodeBudget.breached).toBe(true);
  });

  it('enforces node budget_max_cost_usd ceilings', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-budget-node-cost-'));
    const graph = makeGraph(
      [
        makeNode('start', 'start', {}, 'Mdiamond'),
        makeNode('work', 'mock', { budget_max_cost_usd: '0.5' }),
        makeNode('exit', 'exit', {}, 'Msquare'),
      ],
      [
        { from: 'start', to: 'work', weight: 0, attributes: {} },
        { from: 'work', to: 'exit', weight: 0, attributes: {} },
      ]
    );

    const executed: string[] = [];
    const handler = new BudgetMockHandler(
      {
        work: {
          status: 'SUCCESS',
          context_updates: {
            'budget.work.cost_usd': 1.2,
          },
        },
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
    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('node.budget_max_cost_usd exceeded');
    expect(executed).toEqual(['work']);

    const nodeBudget = (await readJson(join(logsRoot, 'work', 'budget_result.json'))) as Record<string, unknown>;
    const usage = nodeBudget.usage as Record<string, unknown>;
    expect(usage.cost_usd).toBe(1.2);
    expect(nodeBudget.breached).toBe(true);
  });
});

function makeNode(
  id: string,
  type: string,
  attributes: Record<string, unknown> = {},
  shape = 'box',
  timeout?: number
): Node {
  return {
    id,
    type,
    shape,
    label: id,
    timeout,
    max_retries: 0,
    goal_gate: false,
    reasoning_effort: 'high',
    auto_status: false,
    allow_partial: false,
    attributes,
  };
}

function makeGraph(
  nodes: Node[],
  edges: Edge[],
  attributes: Record<string, unknown> = {}
): Graph {
  return {
    id: 'BudgetGraph',
    default_max_retry: 50,
    nodes: new Map(nodes.map(node => [node.id, node])),
    edges,
    attributes,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8')) as unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
