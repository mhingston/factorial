import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointManager } from './index.js';
import { Context } from '../context/index.js';
import type { Checkpoint, Outcome } from '../types/index.js';

describe('CheckpointManager', () => {
  it('saves and loads checkpoint files', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-checkpoint-save-load-'));
    const manager = new CheckpointManager(logsRoot);

    const checkpoint: Checkpoint = {
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      current_node: 'work',
      completed_nodes: ['start', 'work'],
      node_retries: { work: 1 },
      context_values: { ok: true, nested: { depth: 2 } },
      node_outcomes: {
        work: { status: 'SUCCESS', context_updates: { done: true } },
      },
      logs: ['started', 'done'],
    };

    const path = await manager.save(checkpoint);
    const loaded = await manager.load(path);

    expect(loaded.current_node).toBe('work');
    expect(loaded.completed_nodes).toEqual(['start', 'work']);
    expect(loaded.context_values).toEqual({ ok: true, nested: { depth: 2 } });
    expect(loaded.node_retries).toEqual({ work: 1 });
    expect(loaded.node_outcomes?.work.status).toBe('SUCCESS');
    expect(loaded.timestamp.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns null from loadLatest when no checkpoint exists', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-checkpoint-empty-'));
    const manager = new CheckpointManager(logsRoot);
    await expect(manager.loadLatest()).resolves.toBeNull();
  });

  it('creates independent snapshots and restores context', async () => {
    const context = new Context();
    await context.set('count', 1);
    await context.set('payload', { deep: true });

    const completedNodes = ['start'];
    const nodeRetries: Record<string, number> = { start: 0 };
    const logs = ['line-1'];
    const nodeOutcomes: Record<string, Outcome> = {
      start: { status: 'SUCCESS', context_updates: {} },
    };

    const checkpoint = CheckpointManager.create(
      context,
      'start',
      completedNodes,
      nodeRetries,
      logs,
      nodeOutcomes
    );

    completedNodes.push('mutated');
    nodeRetries.start = 99;
    logs.push('line-2');
    nodeOutcomes.start = { status: 'FAIL', context_updates: {}, failure_reason: 'mutated' };

    expect(checkpoint.completed_nodes).toEqual(['start']);
    expect(checkpoint.node_retries).toEqual({ start: 0 });
    expect(checkpoint.logs).toEqual(['line-1']);
    expect(checkpoint.node_outcomes?.start.status).toBe('SUCCESS');

    const restoredContext = CheckpointManager.restoreContext(checkpoint);
    await expect(restoredContext.get<number>('count')).resolves.toBe(1);
    await expect(restoredContext.get<{ deep: boolean }>('payload')).resolves.toEqual({ deep: true });
  });
});
