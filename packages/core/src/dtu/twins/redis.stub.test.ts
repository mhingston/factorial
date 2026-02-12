import { describe, expect, it } from 'vitest';
import type { TwinInvocationRequest } from '../contracts.js';
import { RedisTwinStub } from './redis.stub.js';

describe('RedisTwinStub', () => {
  const twin = new RedisTwinStub();
  const baseTiming = { requested_at_ms: 1700000000000, timeout_ms: 1000 };

  it('gets a value by key', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'kv.get',
      scenario_id: 'scenario-1',
      seed: 'seed-1',
      input: {
        key: 'user:123',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('user:123');
    expect(result.output.exists).toBe(true);
    expect(result.output.value).toBeDefined();
  });

  it('sets a value with TTL', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'kv.set',
      scenario_id: 'scenario-2',
      seed: 'seed-2',
      input: {
        key: 'session:abc',
        value: { user_id: 123, active: true },
        ttl_seconds: 3600,
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('session:abc');
    expect(result.output.ttl_seconds).toBe(3600);
  });

  it('deletes a key', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'kv.delete',
      scenario_id: 'scenario-3',
      seed: 'seed-3',
      input: {
        key: 'temp:data',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('temp:data');
    expect(result.output.deleted).toBe(true);
    expect(result.output.deleted_count).toBe(1);
  });

  it('publishes to a channel', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'pubsub.publish',
      scenario_id: 'scenario-4',
      seed: 'seed-4',
      input: {
        channel: 'notifications',
        message: 'New order received',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.channel).toBe('notifications');
    expect(result.output.subscribers_received).toBe(2);
    expect(result.output.message_id).toBeDefined();
  });

  it('subscribes to a channel', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'pubsub.subscribe',
      scenario_id: 'scenario-5',
      seed: 'seed-5',
      input: {
        channel: 'events',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.channel).toBe('events');
    expect(result.output.subscription_id).toMatch(/^sub_/);
  });

  it('pushes to a list', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'list.push',
      scenario_id: 'scenario-6',
      seed: 'seed-6',
      input: {
        key: 'queue:tasks',
        values: ['task1', 'task2', 'task3'],
        side: 'right',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('queue:tasks');
    expect(result.output.pushed_count).toBe(3);
    expect(result.output.list_length).toBeGreaterThan(0);
  });

  it('gets range from a list', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'list.range',
      scenario_id: 'scenario-7',
      seed: 'seed-7',
      input: {
        key: 'recent:items',
        start: 0,
        end: 9,
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('recent:items');
    expect(Array.isArray(result.output.values)).toBe(true);
    expect(result.output.list_length).toBeGreaterThanOrEqual(0);
  });

  it('adds members to a set', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'set.add',
      scenario_id: 'scenario-8',
      seed: 'seed-8',
      input: {
        key: 'tags:article',
        members: ['redis', 'database', 'cache'],
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('tags:article');
    expect(result.output.added_count).toBe(3);
    expect(result.output.set_cardinality).toBeGreaterThan(0);
  });

  it('gets set members', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'set.members',
      scenario_id: 'scenario-9',
      seed: 'seed-9',
      input: {
        key: 'categories:product',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('categories:product');
    expect(Array.isArray(result.output.members)).toBe(true);
    expect(result.output.cardinality).toBeGreaterThanOrEqual(0);
  });

  it('handles key not found', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'kv.get',
      scenario_id: 'scenario-10',
      seed: 'seed-10',
      input: {
        key: 'missing:key',
        actor: 'tester',
        simulate: 'not_found',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.exists).toBe(false);
    expect(result.output.value).toBeNull();
  });

  it('handles rate limit simulation', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'kv.get',
      scenario_id: 'scenario-11',
      seed: 'seed-11',
      input: {
        key: 'test',
        actor: 'tester',
        simulate: 'rate_limited',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('rate_limited');
    expect(result.error?.retryable).toBe(true);
  });

  it('rejects unsupported operations', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'unsupported.op',
      scenario_id: 'scenario-12',
      seed: 'seed-12',
      input: {},
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('operation_not_supported');
  });

  it('rejects malformed input', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'redis',
      operation: 'kv.set',
      scenario_id: 'scenario-13',
      seed: 'seed-13',
      input: {
        key: '',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('malformed_request');
  });
});
