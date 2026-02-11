import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecutionCancelledError, ExecutionEngine } from './index.js';
import { CheckpointManager } from '../checkpoint/index.js';
import type { Context, Edge, Graph, Handler, Node, Outcome, RunConfig } from '../types/index.js';

class SlowCancellableHandler implements Handler {
  async execute(
    _node: Node,
    _context: Context,
    _graph: Graph,
    _logsRoot: string,
    signal?: AbortSignal
  ): Promise<Outcome> {
    await waitForAbort(signal, 100);
    return {
      status: 'SUCCESS',
      context_updates: {},
    };
  }
}

describe('ExecutionEngine cancellation', () => {
  it('returns SKIPPED when run is cancelled mid-node', async () => {
    const { graph, config } = await buildSimpleGraph('attractor-run-cancel-');
    const engine = new ExecutionEngine(graph, config);
    engine.getHandlerRegistry().register('mock', new SlowCancellableHandler());

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    const outcome = await engine.run(controller.signal);
    expect(outcome.status).toBe('SKIPPED');
  });

  it('returns SKIPPED when resume is cancelled mid-node', async () => {
    const { graph, config } = await buildSimpleGraph('attractor-resume-cancel-');
    const checkpointManager = new CheckpointManager(config.logs_root);
    await checkpointManager.save({
      timestamp: new Date(),
      current_node: 'start',
      completed_nodes: ['start'],
      node_retries: {},
      context_values: { 'graph.id': graph.id },
      node_outcomes: {
        start: { status: 'SUCCESS', context_updates: {} },
      },
      logs: [],
    });

    const engine = new ExecutionEngine(graph, config);
    engine.getHandlerRegistry().register('mock', new SlowCancellableHandler());

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    const outcome = await engine.resume(undefined, controller.signal);
    expect(outcome.status).toBe('SKIPPED');
  });
});

async function buildSimpleGraph(prefix: string): Promise<{ graph: Graph; config: RunConfig }> {
  const logsRoot = await mkdtemp(join(tmpdir(), prefix));

  const nodes = new Map<string, Node>([
    [
      'start',
      {
        id: 'start',
        type: 'start',
        shape: 'Mdiamond',
        label: 'start',
        max_retries: 0,
        goal_gate: false,
        reasoning_effort: 'high',
        auto_status: false,
        allow_partial: false,
        attributes: {},
      },
    ],
    [
      'work',
      {
        id: 'work',
        type: 'mock',
        shape: 'box',
        label: 'work',
        max_retries: 0,
        goal_gate: false,
        reasoning_effort: 'high',
        auto_status: false,
        allow_partial: false,
        attributes: {},
      },
    ],
    [
      'exit',
      {
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
      },
    ],
  ]);

  const edges: Edge[] = [
    { from: 'start', to: 'work', weight: 0, attributes: {} },
    { from: 'work', to: 'exit', weight: 0, attributes: {} },
  ];

  const graph: Graph = {
    id: 'CancelGraph',
    default_max_retry: 50,
    nodes,
    edges,
    attributes: {},
  };

  return {
    graph,
    config: {
      logs_root: logsRoot,
    },
  };
}

async function waitForAbort(signal: AbortSignal | undefined, timeoutMs: number): Promise<void> {
  if (!signal) {
    await sleep(timeoutMs);
    return;
  }

  if (signal.aborted) {
    throw new ExecutionCancelledError();
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const onAbort = () => {
      cleanup();
      reject(new ExecutionCancelledError());
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
