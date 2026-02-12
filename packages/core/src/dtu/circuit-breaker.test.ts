import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
} from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('starts in closed state', () => {
    const cb = new CircuitBreaker('test');
    expect(cb.getState()).toBe('closed');
    expect(cb.getMetrics().state).toBe('closed');
  });

  it('allows calls when closed', async () => {
    const cb = new CircuitBreaker('test');
    const operation = vi.fn().mockResolvedValue('success');

    const result = await cb.execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(cb.getMetrics().total_successes).toBe(1);
  });

  it('tracks failures and opens after threshold', async () => {
    const cb = new CircuitBreaker('test', { failure_threshold: 3 });
    const error = new Error('test error');
    const operation = vi.fn().mockRejectedValue(error);

    // Fail 3 times
    await expect(cb.execute(operation)).rejects.toThrow(error);
    await expect(cb.execute(operation)).rejects.toThrow(error);
    await expect(cb.execute(operation)).rejects.toThrow(error);

    expect(cb.getState()).toBe('open');
    expect(cb.getMetrics().total_failures).toBe(3);
  });

  it('rejects calls when open', async () => {
    const cb = new CircuitBreaker('test', { failure_threshold: 1 });
    const error = new Error('test error');

    await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow(error);
    expect(cb.getState()).toBe('open');

    // Next call should be rejected immediately
    await expect(cb.execute(() => Promise.resolve('success'))).rejects.toThrow(
      CircuitBreakerOpenError
    );
  });

  it('emits events on state changes', async () => {
    const cb = new CircuitBreaker('test', { failure_threshold: 1 });
    const events: { type: string; previous_state?: string; new_state?: string }[] = [];

    cb.onEvent(event => {
      events.push({
        type: event.type,
        previous_state: event.previous_state,
        new_state: event.new_state,
      });
    });

    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    expect(events).toContainEqual({
      type: 'failure',
    });
    expect(events).toContainEqual({
      type: 'state_change',
      previous_state: 'closed',
      new_state: 'open',
    });
  });

  it('transitions to half-open after timeout', async () => {
    const cb = new CircuitBreaker('test', {
      failure_threshold: 1,
      timeout_ms: 5000,
    });

    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    // Advance time past timeout
    vi.advanceTimersByTime(5001);

    // Next call should trigger transition to half-open
    const operation = vi.fn().mockResolvedValue('success');
    await cb.execute(operation);

    expect(cb.getState()).toBe('half_open');
  });

  it('closes after success threshold in half-open', async () => {
    const cb = new CircuitBreaker('test', {
      failure_threshold: 1,
      success_threshold: 2,
      timeout_ms: 5000,
    });

    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    vi.advanceTimersByTime(5001);

    // First success in half-open
    await cb.execute(() => Promise.resolve('success1'));
    expect(cb.getState()).toBe('half_open');

    // Second success should close
    await cb.execute(() => Promise.resolve('success2'));
    expect(cb.getState()).toBe('closed');
  });

  it('opens on failure in half-open', async () => {
    const cb = new CircuitBreaker('test', {
      failure_threshold: 1,
      timeout_ms: 5000,
    });

    await expect(cb.execute(() => Promise.reject(new Error('fail1')))).rejects.toThrow();
    vi.advanceTimersByTime(5001);

    // One success in half-open
    await cb.execute(() => Promise.resolve('success'));
    expect(cb.getState()).toBe('half_open');

    // Failure should open again
    await expect(cb.execute(() => Promise.reject(new Error('fail2')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');
  });

  it('limits half-open calls', async () => {
    const cb = new CircuitBreaker('test', {
      failure_threshold: 1,
      timeout_ms: 5000,
      half_open_max_calls: 2,
    });

    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    vi.advanceTimersByTime(5001);

    // Make 2 calls in half-open
    await cb.execute(() => Promise.resolve('success1'));
    await cb.execute(() => Promise.resolve('success2'));

    // Third call should be rejected
    await expect(cb.execute(() => Promise.resolve('success3'))).rejects.toThrow(
      CircuitBreakerOpenError
    );
  });

  it('tracks consecutive successes/failures', async () => {
    const cb = new CircuitBreaker('test', { failure_threshold: 5 });

    // 2 successes
    await cb.execute(() => Promise.resolve('s1'));
    await cb.execute(() => Promise.resolve('s2'));
    expect(cb.getMetrics().consecutive_successes).toBe(2);
    expect(cb.getMetrics().consecutive_failures).toBe(0);

    // 1 failure resets consecutive successes
    await expect(cb.execute(() => Promise.reject(new Error('f1')))).rejects.toThrow();
    expect(cb.getMetrics().consecutive_successes).toBe(0);
    expect(cb.getMetrics().consecutive_failures).toBe(1);

    // 1 success resets consecutive failures
    await cb.execute(() => Promise.resolve('s3'));
    expect(cb.getMetrics().consecutive_successes).toBe(1);
    expect(cb.getMetrics().consecutive_failures).toBe(0);
  });

  it('supports force open/closed', async () => {
    const cb = new CircuitBreaker('test');

    cb.forceOpen();
    expect(cb.getState()).toBe('open');

    cb.forceClosed();
    expect(cb.getState()).toBe('closed');
  });
});

describe('CircuitBreakerRegistry', () => {
  it('creates breakers on first access', () => {
    const registry = new CircuitBreakerRegistry();

    const cb1 = registry.getOrCreate('test1');
    const cb2 = registry.getOrCreate('test2');

    expect(cb1.getName()).toBe('test1');
    expect(cb2.getName()).toBe('test2');
    expect(registry.getAll()).toHaveLength(2);
  });

  it('returns same instance for same name', () => {
    const registry = new CircuitBreakerRegistry();

    const cb1 = registry.getOrCreate('test');
    const cb2 = registry.getOrCreate('test');

    expect(cb1).toBe(cb2);
  });

  it('returns undefined for unknown breaker', () => {
    const registry = new CircuitBreakerRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('resets all breakers', async () => {
    const registry = new CircuitBreakerRegistry();
    const cb = registry.getOrCreate('test', { failure_threshold: 1 });

    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(cb.getState()).toBe('open');

    registry.resetAll();
    expect(cb.getState()).toBe('closed');
  });

  it('clears all breakers', () => {
    const registry = new CircuitBreakerRegistry();
    registry.getOrCreate('test1');
    registry.getOrCreate('test2');

    expect(registry.getAll()).toHaveLength(2);

    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});

describe('CircuitBreakerOpenError', () => {
  it('contains circuit breaker name and metrics', () => {
    const metrics = {
      state: 'open' as const,
      failure_count: 5,
      success_count: 0,
      last_failure_time_ms: Date.now(),
      last_success_time_ms: null,
      total_calls: 5,
      total_failures: 5,
      total_successes: 0,
      consecutive_successes: 0,
      consecutive_failures: 5,
    };

    const error = new CircuitBreakerOpenError('Test error', 'my-breaker', metrics);

    expect(error.name).toBe('CircuitBreakerOpenError');
    expect(error.message).toBe('Test error');
    expect(error.circuitBreakerName).toBe('my-breaker');
    expect(error.metrics).toEqual(metrics);
  });
});
