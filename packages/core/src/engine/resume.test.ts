import { describe, expect, it } from 'vitest';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context, Graph, Node, Edge, Outcome, RunConfig } from '../types/index.js';
import { ExecutionEngine } from './index.js';
import { CheckpointManager } from '../checkpoint/index.js';
import { StartHandler, ExitHandler } from '../handlers/builtin.js';

describe('ExecutionEngine resume', () => {
  it('continues execution from a saved checkpoint', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-'));

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
        'task',
        {
          id: 'task',
          type: 'tool',
          shape: 'parallelogram',
          label: 'task',
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
      { from: 'start', to: 'task', weight: 0, attributes: {} },
      { from: 'task', to: 'exit', weight: 0, attributes: {} },
    ];

    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const config: RunConfig = { logs_root: logsRoot };
    const checkpointManager = new CheckpointManager(logsRoot);

    const startOutcome: Outcome = { status: 'SUCCESS', context_updates: {} };
    await checkpointManager.save({
      timestamp: new Date(),
      current_node: 'start',
      completed_nodes: ['start'],
      node_retries: {},
      context_values: { 'graph.id': 'G' },
      node_outcomes: { start: startOutcome },
      logs: [],
    });

    let toolRan = false;
    class TestToolHandler {
      async execute(_node: Node, _context: Context, _graph: Graph, _logsRoot: string, _signal?: AbortSignal): Promise<Outcome> {
        toolRan = true;
        return { status: 'SUCCESS', context_updates: {} };
      }
    }

    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('tool', new TestToolHandler());
    registry.register('exit', new ExitHandler());

    const outcome = await engine.resume();

    expect(toolRan).toBe(true);
    expect(outcome.status).toBe('SUCCESS');
  });

  it('restores segment logs root from checkpoint context', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-resume-segment-'));
    const segmentLogsRoot = join(logsRoot, 'restart-003');

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
        'task',
        {
          id: 'task',
          type: 'tool',
          shape: 'parallelogram',
          label: 'task',
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
      { from: 'start', to: 'task', weight: 0, attributes: {} },
      { from: 'task', to: 'exit', weight: 0, attributes: {} },
    ];

    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const config: RunConfig = { logs_root: logsRoot };
    const checkpointManager = new CheckpointManager(logsRoot);

    const startOutcome: Outcome = { status: 'SUCCESS', context_updates: {} };
    await checkpointManager.save({
      timestamp: new Date(),
      current_node: 'start',
      completed_nodes: ['start'],
      node_retries: {},
      context_values: {
        'graph.id': 'G',
        'run.segment_index': 3,
        'run.restart_count': 3,
        'run.segment_logs_root': segmentLogsRoot,
      },
      node_outcomes: { start: startOutcome },
      logs: [],
    });

    class SegmentAwareToolHandler {
      async execute(
        _node: Node,
        _context: Context,
        _graph: Graph,
        activeLogsRoot: string,
        _signal?: AbortSignal
      ): Promise<Outcome> {
        await writeFile(join(activeLogsRoot, 'resume-marker.txt'), 'resumed');
        return { status: 'SUCCESS', context_updates: {} };
      }
    }

    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('tool', new SegmentAwareToolHandler());
    registry.register('exit', new ExitHandler());

    const outcome = await engine.resume();

    expect(outcome.status).toBe('SUCCESS');
    await expect(access(join(segmentLogsRoot, 'resume-marker.txt'))).resolves.toBeUndefined();
  });
});
