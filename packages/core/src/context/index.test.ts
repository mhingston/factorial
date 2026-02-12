import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context } from './index.js';

describe('Context', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports set/get/getString and default fallbacks', async () => {
    const context = new Context();
    await context.set('num', 42);
    await context.set('nullable', null);

    await expect(context.get<number>('num')).resolves.toBe(42);
    await expect(context.get('missing', 'fallback')).resolves.toBe('fallback');
    await expect(context.getString('num')).resolves.toBe('42');
    await expect(context.getString('nullable', 'none')).resolves.toBe('none');
    await expect(context.getString('missing', 'default')).resolves.toBe('default');
  });

  it('manages logs and value collections', async () => {
    const context = new Context();
    await context.appendLog('a');
    await context.appendLog('b');
    await context.apply_updates({ alpha: 1, beta: 2 });

    await expect(context.getLogs()).resolves.toEqual(['a', 'b']);
    await expect(context.keys()).resolves.toEqual(expect.arrayContaining(['alpha', 'beta']));
    await expect(context.has('alpha')).resolves.toBe(true);
    await expect(context.delete('alpha')).resolves.toBe(true);
    await expect(context.has('alpha')).resolves.toBe(false);

    await context.clear();
    expect(context.snapshot()).toEqual({});
  });

  it('deep clones values and falls back to shallow copy when structuredClone fails', async () => {
    const context = new Context();
    const deep = { nested: { count: 1 } };
    const fallbackRef = { force_fail_clone: true, count: 1 };
    await context.set('deep', deep);
    await context.set('fallback', fallbackRef);
    await context.appendLog('keep');

    const nativeStructuredClone = globalThis.structuredClone;
    vi.stubGlobal('structuredClone', (value: unknown) => {
      if (
        value &&
        typeof value === 'object' &&
        'force_fail_clone' in (value as Record<string, unknown>)
      ) {
        throw new Error('clone failed');
      }
      return nativeStructuredClone(value);
    });

    const cloned = context.clone();
    const clonedDeep = await cloned.get<{ nested: { count: number } }>('deep');
    const clonedFallback = await cloned.get<{ force_fail_clone: boolean; count: number }>('fallback');

    expect(clonedDeep).toEqual({ nested: { count: 1 } });
    expect(clonedDeep).not.toBe(deep);
    expect(clonedFallback).toBe(fallbackRef);
    await expect(cloned.getLogs()).resolves.toEqual(['keep']);
  });

  it('creates context from snapshot', async () => {
    const context = Context.fromSnapshot({ one: 1, two: '2' });
    await expect(context.get<number>('one')).resolves.toBe(1);
    await expect(context.getString('two')).resolves.toBe('2');
  });

  it('supports steering queue operations', async () => {
    const context = new Context();
    
    // Initially empty
    await expect(context.peekSteeringQueue()).resolves.toEqual([]);
    await expect(context.drainSteeringQueue()).resolves.toEqual([]);
    
    // Queue messages
    await context.steer('Please fix the error', 'user');
    await context.steer('Consider using a different approach', 'system');
    
    // Peek without clearing
    const peeked = await context.peekSteeringQueue();
    expect(peeked).toHaveLength(2);
    expect(peeked[0].content).toBe('Please fix the error');
    expect(peeked[0].source).toBe('user');
    expect(peeked[1].content).toBe('Consider using a different approach');
    expect(peeked[1].source).toBe('system');
    expect(peeked[0].timestamp).toBeDefined();
    
    // Still there after peek
    await expect(context.peekSteeringQueue()).resolves.toHaveLength(2);
    
    // Drain clears the queue
    const drained = await context.drainSteeringQueue();
    expect(drained).toHaveLength(2);
    expect(drained[0].content).toBe('Please fix the error');
    expect(drained[1].content).toBe('Consider using a different approach');
    
    // Empty after drain
    await expect(context.peekSteeringQueue()).resolves.toEqual([]);
    await expect(context.drainSteeringQueue()).resolves.toEqual([]);
  });

  it('clones steering queue correctly', async () => {
    const context = new Context();
    await context.steer('Original message', 'user');
    
    const cloned = context.clone();
    
    // Cloned queue has the same message
    const clonedQueue = await cloned.peekSteeringQueue();
    expect(clonedQueue).toHaveLength(1);
    expect(clonedQueue[0].content).toBe('Original message');
    
    // Draining cloned doesn't affect original
    await cloned.drainSteeringQueue();
    await expect(cloned.peekSteeringQueue()).resolves.toEqual([]);
    await expect(context.peekSteeringQueue()).resolves.toHaveLength(1);
  });
});
