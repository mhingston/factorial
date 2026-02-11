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
});
