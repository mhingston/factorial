import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Context, Edge, ExecutionEvent, Graph, Handler, Node, Outcome, RunConfig } from '../types/index.js';
import { ExecutionEngine } from './index.js';
import { ExitHandler, StartHandler } from '../handlers/builtin.js';

class RestartMarkerHandler implements Handler {
  private callCount = 0;

  async execute(
    _node: Node,
    context: Context,
    _graph: Graph,
    logsRoot: string
  ): Promise<Outcome> {
    this.callCount += 1;
    await writeFile(join(logsRoot, `marker-${this.callCount}.txt`), `call-${this.callCount}`);
    const segmentIndex = await context.get<number>('run.segment_index', -1);

    return {
      status: 'SUCCESS',
      context_updates: {
        'marker.call': this.callCount,
        'marker.segment': segmentIndex ?? -1,
      },
    };
  }
}

describe('ExecutionEngine loop_restart boundaries', () => {
  it('creates a fresh logs segment and run boundary event on loop_restart', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-loop-restart-'));

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
      {
        from: 'work',
        to: 'work',
        condition: 'context.marker.call=1',
        loop_restart: true,
        weight: 1,
        attributes: {},
      },
      {
        from: 'work',
        to: 'exit',
        condition: 'context.marker.call=2',
        weight: 1,
        attributes: {},
      },
    ];

    const graph: Graph = {
      id: 'LoopRestartGraph',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const config: RunConfig = { logs_root: logsRoot, max_restarts: 5 };
    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('mock', new RestartMarkerHandler());
    registry.register('exit', new ExitHandler());

    const events: ExecutionEvent[] = [];
    engine.on('event', event => events.push(event as ExecutionEvent));

    const outcome = await engine.run();

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates['marker.call']).toBe(2);
    expect(outcome.context_updates['marker.segment']).toBe(1);

    await expect(access(join(logsRoot, 'marker-1.txt'))).resolves.toBeUndefined();
    await expect(access(join(logsRoot, 'restart-001', 'marker-2.txt'))).resolves.toBeUndefined();

    const runSegments = JSON.parse(await readFile(join(logsRoot, 'run_segments.json'), 'utf-8')) as {
      segments: Array<Record<string, unknown>>;
    };
    expect(runSegments.segments).toHaveLength(2);
    expect(runSegments.segments[1]?.segment_index).toBe(1);

    const restartCompleteEvents = events.filter(
      event => event.type === 'RUN_COMPLETE' && Boolean((event.data as Record<string, unknown>)?.restart)
    );
    const restartStartEvents = events.filter(
      event => event.type === 'RUN_START' && Boolean((event.data as Record<string, unknown>)?.restart)
    );
    expect(restartCompleteEvents).toHaveLength(1);
    expect(restartStartEvents).toHaveLength(1);
  });

  it('fails when loop_restart exceeds max_restarts', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-loop-restart-limit-'));

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
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'work', weight: 0, attributes: {} },
      {
        from: 'work',
        to: 'work',
        loop_restart: true,
        weight: 1,
        attributes: {},
      },
    ];

    const graph: Graph = {
      id: 'LoopRestartLimitGraph',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const config: RunConfig = { logs_root: logsRoot, max_restarts: 1 };
    const engine = new ExecutionEngine(graph, config);
    const registry = engine.getHandlerRegistry();
    registry.register('start', new StartHandler());
    registry.register('mock', new RestartMarkerHandler());

    const outcome = await engine.run();

    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('Max loop restarts exceeded');
  });
});
