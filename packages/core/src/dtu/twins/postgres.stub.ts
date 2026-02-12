import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const queryInputSchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'syntax_error', 'connection_failed']).default('none'),
});

const transactionInputSchema = z.object({
  operations: z.array(
    z.object({
      sql: z.string().min(1),
      params: z.array(z.unknown()).default([]),
    })
  ).min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'syntax_error', 'rollback', 'deadlock']).default('none'),
});

const connectInputSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().default(5432),
  database: z.string().min(1),
  user: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'connection_failed', 'invalid_database']).default('none'),
});

const preparedStatementInputSchema = z.object({
  name: z.string().min(1),
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'syntax_error', 'not_found']).default('none'),
});

export class PostgresTwinStub implements TwinContract {
  readonly twin_id = 'postgres';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    switch (request.operation) {
      case 'sql.query':
        return this.executeQuery(request);
      case 'sql.transaction':
        return this.executeTransaction(request);
      case 'connection.connect':
        return this.connect(request);
      case 'prepared.prepare':
        return this.prepareStatement(request);
      case 'prepared.execute':
        return this.executePrepared(request);
      default:
        return {
          status: 'error',
          error: {
            code: 'operation_not_supported',
            class: 'spec_mismatch',
            message: `Unsupported operation for postgres twin: ${request.operation}`,
            retryable: false,
            details: {},
          },
          latency_ms: 1,
          metadata: {
            supported_operations: [
              'sql.query',
              'sql.transaction',
              'connection.connect',
              'prepared.prepare',
              'prepared.execute',
            ],
          },
        };
    }
  }

  private async executeQuery(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = queryInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid sql.query input for postgres twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'syntax_error') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Syntax error in SQL query.',
          retryable: false,
          details: { sql: input.sql },
        },
        latency_ms: 2,
        metadata: { provider: 'postgres' },
      };
    }

    const rowCount = this.determineRowCount(input.sql);
    const rows = Array.from({ length: rowCount }).map((_, index) => {
      const row: Record<string, unknown> = {
        id: deterministicSuffix(`${request.seed}:${index}`),
      };
      for (let i = 0; i < input.params.length; i++) {
        row[`param${i}`] = input.params[i];
      }
      return row;
    });

    return {
      status: 'success',
      output: {
        rows,
        row_count: rows.length,
        sql: input.sql,
        executed_at: new Date(request.timing.requested_at_ms).toISOString(),
        executed_by: input.actor,
      },
      latency_ms: rowCount * 2 + 3,
      metadata: {
        provider: 'postgres',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async executeTransaction(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = transactionInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid sql.transaction input for postgres twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'syntax_error') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Syntax error in transaction SQL.',
          retryable: false,
          details: { operation_index: 0 },
        },
        latency_ms: 3,
        metadata: { provider: 'postgres' },
      };
    }

    if (input.simulate === 'rollback') {
      return {
        status: 'error',
        error: {
          code: 'internal_error',
          class: 'transient',
          message: 'Transaction rolled back due to error.',
          retryable: true,
          details: { rollback: true },
        },
        latency_ms: 8,
        metadata: { provider: 'postgres' },
      };
    }

    if (input.simulate === 'deadlock') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Deadlock detected. Transaction rolled back.',
          retryable: true,
          details: { deadlock: true },
        },
        latency_ms: 10,
        metadata: { provider: 'postgres' },
      };
    }

    const results = input.operations.map((op, index) => ({
      index,
      row_count: this.determineRowCount(op.sql),
      status: 'success',
    }));

    return {
      status: 'success',
      output: {
        results,
        operation_count: input.operations.length,
        committed_at: new Date(request.timing.requested_at_ms).toISOString(),
        committed_by: input.actor,
      },
      latency_ms: input.operations.length * 5 + 5,
      metadata: {
        provider: 'postgres',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async connect(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = connectInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid connection.connect input for postgres twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'connection_failed') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: `Could not connect to ${input.host}:${input.port}.`,
          retryable: true,
          details: { host: input.host, port: input.port },
        },
        latency_ms: 12,
        metadata: { provider: 'postgres' },
      };
    }

    if (input.simulate === 'invalid_database') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Database "${input.database}" does not exist.`,
          retryable: false,
          details: { database: input.database },
        },
        latency_ms: 3,
        metadata: { provider: 'postgres' },
      };
    }

    const connectionId = `pg_${deterministicSuffix(`${request.seed}:${input.host}:${input.database}`)}`;
    return {
      status: 'success',
      output: {
        connection_id: connectionId,
        host: input.host,
        port: input.port,
        database: input.database,
        user: input.user,
        connected_at: new Date(request.timing.requested_at_ms).toISOString(),
        connected_by: input.actor,
      },
      latency_ms: 15,
      metadata: {
        provider: 'postgres',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async prepareStatement(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = preparedStatementInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid prepared.prepare input for postgres twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'syntax_error') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Syntax error in prepared statement SQL.',
          retryable: false,
          details: { sql: input.sql },
        },
        latency_ms: 2,
        metadata: { provider: 'postgres' },
      };
    }

    return {
      status: 'success',
      output: {
        statement_name: input.name,
        sql: input.sql,
        prepared_at: new Date(request.timing.requested_at_ms).toISOString(),
        prepared_by: input.actor,
      },
      latency_ms: 4,
      metadata: {
        provider: 'postgres',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async executePrepared(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = preparedStatementInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid prepared.execute input for postgres twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'not_found') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Prepared statement "${input.name}" does not exist.`,
          retryable: false,
          details: { statement_name: input.name },
        },
        latency_ms: 2,
        metadata: { provider: 'postgres' },
      };
    }

    const rowCount = this.determineRowCount(input.sql);
    return {
      status: 'success',
      output: {
        statement_name: input.name,
        rows: Array.from({ length: rowCount }).map((_, index) => ({
          id: deterministicSuffix(`${request.seed}:${input.name}:${index}`),
        })),
        row_count: rowCount,
        executed_at: new Date(request.timing.requested_at_ms).toISOString(),
        executed_by: input.actor,
      },
      latency_ms: rowCount * 2 + 2,
      metadata: {
        provider: 'postgres',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private determineRowCount(sql: string): number {
    const lowerSql = sql.toLowerCase();
    if (lowerSql.includes('count(')) return 1;
    if (lowerSql.includes('insert')) return 1;
    if (lowerSql.includes('update')) return Math.floor(Math.random() * 3) + 1;
    if (lowerSql.includes('delete')) return Math.floor(Math.random() * 2) + 1;
    return 3;
  }

  private simulateCommonErrors(simulate: string): TwinInvocationResult | null {
    if (simulate === 'auth_failed') {
      return {
        status: 'error',
        error: {
          code: 'auth_failed',
          class: 'auth',
          message: 'Authentication failed for postgres twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'postgres' },
      };
    }

    if (simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by postgres twin.',
          retryable: true,
          details: { retry_after_ms: 5000 },
        },
        latency_ms: 2,
        metadata: { provider: 'postgres' },
      };
    }

    if (simulate === 'timeout') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout in postgres twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 20,
        metadata: { provider: 'postgres' },
      };
    }

    if (simulate === 'connection_failed') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Connection failed to postgres twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 15,
        metadata: { provider: 'postgres' },
      };
    }

    return null;
  }

  private buildMalformedResponse(message: string, detail?: string): TwinInvocationResult {
    return {
      status: 'error',
      error: {
        code: 'malformed_request',
        class: 'spec_mismatch',
        message,
        retryable: false,
        details: {
          validation_error: detail ?? 'invalid payload',
        },
      },
      latency_ms: 1,
      metadata: { provider: 'postgres' },
    };
  }
}

function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 47 + char.charCodeAt(0)) % 1000000;
  }
  return String(hash).padStart(6, '0');
}
