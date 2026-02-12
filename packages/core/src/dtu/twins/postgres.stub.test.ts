import { describe, expect, it } from 'vitest';
import type { TwinInvocationRequest } from '../contracts.js';
import { PostgresTwinStub } from './postgres.stub.js';

describe('PostgresTwinStub', () => {
  const twin = new PostgresTwinStub();
  const baseTiming = { requested_at_ms: 1700000000000, timeout_ms: 1000 };

  it('executes SQL query', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'sql.query',
      scenario_id: 'scenario-1',
      seed: 'seed-1',
      input: {
        sql: 'SELECT * FROM users WHERE active = true',
        params: [true],
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.rows).toBeDefined();
    expect(Array.isArray(result.output.rows)).toBe(true);
    expect(result.output.sql).toBe('SELECT * FROM users WHERE active = true');
  });

  it('executes transaction', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'sql.transaction',
      scenario_id: 'scenario-2',
      seed: 'seed-2',
      input: {
        operations: [
          { sql: 'INSERT INTO users (name) VALUES ($1)', params: ['Alice'] },
          { sql: 'INSERT INTO logs (action) VALUES ($1)', params: ['create_user'] },
        ],
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.results).toHaveLength(2);
    expect(result.output.committed_at).toBeDefined();
  });

  it('connects to database', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'connection.connect',
      scenario_id: 'scenario-3',
      seed: 'seed-3',
      input: {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.connection_id).toMatch(/^pg_/);
    expect(result.output.database).toBe('testdb');
  });

  it('prepares statement', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'prepared.prepare',
      scenario_id: 'scenario-4',
      seed: 'seed-4',
      input: {
        name: 'get_user_by_id',
        sql: 'SELECT * FROM users WHERE id = $1',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.statement_name).toBe('get_user_by_id');
    expect(result.output.sql).toBe('SELECT * FROM users WHERE id = $1');
  });

  it('executes prepared statement', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'prepared.execute',
      scenario_id: 'scenario-5',
      seed: 'seed-5',
      input: {
        name: 'get_user_by_id',
        sql: 'SELECT * FROM users WHERE id = $1',
        params: ['123'],
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.statement_name).toBe('get_user_by_id');
    expect(result.output.rows).toBeDefined();
  });

  it('handles syntax error simulation', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'sql.query',
      scenario_id: 'scenario-6',
      seed: 'seed-6',
      input: {
        sql: 'SELECT * FROM users',
        actor: 'tester',
        simulate: 'syntax_error',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('malformed_request');
  });

  it('handles connection failure', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'connection.connect',
      scenario_id: 'scenario-7',
      seed: 'seed-7',
      input: {
        host: 'invalid-host',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        actor: 'tester',
        simulate: 'connection_failed',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('timeout');
    expect(result.error?.retryable).toBe(true);
  });

  it('handles transaction rollback', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'sql.transaction',
      scenario_id: 'scenario-8',
      seed: 'seed-8',
      input: {
        operations: [{ sql: 'INSERT INTO test VALUES (1)', params: [] }],
        actor: 'tester',
        simulate: 'rollback',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('internal_error');
  });

  it('handles deadlock simulation', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'sql.transaction',
      scenario_id: 'scenario-9',
      seed: 'seed-9',
      input: {
        operations: [{ sql: 'UPDATE users SET name = $1', params: ['test'] }],
        actor: 'tester',
        simulate: 'deadlock',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('rate_limited');
    expect(result.error?.details.deadlock).toBe(true);
  });

  it('handles prepared statement not found', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'prepared.execute',
      scenario_id: 'scenario-10',
      seed: 'seed-10',
      input: {
        name: 'missing_stmt',
        sql: 'SELECT 1',
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

  it('rejects unsupported operations', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'postgres',
      operation: 'unsupported.op',
      scenario_id: 'scenario-11',
      seed: 'seed-11',
      input: {},
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('operation_not_supported');
  });
});
