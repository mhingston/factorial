import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context as ContextImpl } from '../context/index.js';
import type { Context, Edge, Graph, Handler, Node, Outcome, RunConfig } from '../types/index.js';
import { ExecutionEngine } from './index.js';
import { ConfidenceGateHandler, ExitHandler, StartHandler, WaitForHumanHandler } from '../handlers/builtin.js';

class SimpleSuccessHandler implements Handler {
  private executed: string[];

  constructor(executed: string[]) {
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
    return {
      status: 'SUCCESS',
      context_updates: {},
    };
  }
}

describe('ExecutionEngine confidence escalation integration', () => {
  it('routes low-confidence decisions through wait.human before exit', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-confidence-engine-'));
    const graph = makeGraph(
      [
        makeNode('start', 'start', {}, 'Mdiamond'),
        makeNode('route', 'confidence.gate', {
          confidence_signal_path: 'confidence.score',
          escalation_threshold: '0.8',
        }, 'diamond'),
        makeNode('autonomous', 'mock', {}, 'parallelogram'),
        makeNode('human', 'wait.human', {}, 'hexagon'),
        makeNode('exit', 'exit', {}, 'Msquare'),
      ],
      [
        { from: 'start', to: 'route', weight: 0, attributes: {} },
        { from: 'route', to: 'autonomous', label: 'autonomous', weight: 0, attributes: {} },
        { from: 'route', to: 'human', label: 'escalate', weight: 0, attributes: {} },
        { from: 'autonomous', to: 'exit', weight: 0, attributes: {} },
        { from: 'human', to: 'exit', label: '[A] Approve', weight: 0, attributes: {} },
      ]
    );

    const config: RunConfig = { logs_root: logsRoot };
    const context = new ContextImpl();
    await context.set('confidence.score', 0.3);
    const engine = new ExecutionEngine(graph, config, { context });
    const executed: string[] = [];
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('confidence.gate', new ConfidenceGateHandler());
    registry.register('mock', new SimpleSuccessHandler(executed));
    registry.register(
      'wait.human',
      new WaitForHumanHandler({
        ask: async (_question, choices) => choices[0].key,
      })
    );
    registry.register('exit', new ExitHandler());

    const runNodes: string[] = [];
    engine.on('event', event => {
      if (event.type !== 'NODE_START') {
        return;
      }
      const data = event.data as Record<string, unknown>;
      if (typeof data.node === 'string') {
        runNodes.push(data.node);
      }
    });

    const outcome = await engine.run();
    expect(outcome.status).toBe('SUCCESS');
    expect(runNodes).toEqual(['start', 'route', 'human']);
    expect(executed).not.toContain('autonomous');
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
    id: 'ConfidenceGraph',
    default_max_retry: 50,
    nodes: new Map(nodes.map(node => [node.id, node])),
    edges,
    attributes: {},
  };
}
