import { describe, expect, it } from 'vitest';
import type { TwinInvocationRequest } from '../contracts.js';
import { DatabaseTwinStub } from './database.stub.js';

describe('DatabaseTwinStub', () => {
  const twin = new DatabaseTwinStub();
  const baseTiming = { requested_at_ms: 1700000000000, timeout_ms: 1000 };

  it('inserts a record', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'database.records',
      operation: 'records.insert',
      scenario_id: 'scenario-1',
      seed: 'seed-1',
      input: {
        table: 'users',
        record: { name: 'Ada' },
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.table).toBe('users');
    expect(result.output.record_id).toBeDefined();
  });

  it('queries records', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'database.records',
      operation: 'records.query',
      scenario_id: 'scenario-2',
      seed: 'seed-2',
      input: {
        table: 'orders',
        filter: { status: 'open' },
        limit: 2,
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.records).toHaveLength(2);
  });

  it('handles not found on update', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'database.records',
      operation: 'records.update',
      scenario_id: 'scenario-3',
      seed: 'seed-3',
      input: {
        table: 'users',
        record_id: 'missing',
        updates: { status: 'inactive' },
        actor: 'tester',
        simulate: 'not_found',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('twin_not_found');
  });
});
