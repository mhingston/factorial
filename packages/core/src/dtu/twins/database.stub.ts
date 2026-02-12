import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const insertInputSchema = z.object({
  table: z.string().min(1),
  record: z.record(z.unknown()),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

const updateInputSchema = z.object({
  table: z.string().min(1),
  record_id: z.string().min(1),
  updates: z.record(z.unknown()),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

const deleteInputSchema = z.object({
  table: z.string().min(1),
  record_id: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

const queryInputSchema = z.object({
  table: z.string().min(1),
  filter: z.record(z.unknown()).default({}),
  limit: z.number().int().positive().default(10),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

export class DatabaseTwinStub implements TwinContract {
  readonly twin_id = 'database.records';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    switch (request.operation) {
      case 'records.insert':
        return this.insert(request);
      case 'records.update':
        return this.update(request);
      case 'records.delete':
        return this.delete(request);
      case 'records.query':
        return this.query(request);
      default:
        return {
          status: 'error',
          error: {
            code: 'operation_not_supported',
            class: 'spec_mismatch',
            message: `Unsupported operation for database.records twin: ${request.operation}`,
            retryable: false,
            details: {},
          },
          latency_ms: 1,
          metadata: {
            supported_operations: ['records.insert', 'records.update', 'records.delete', 'records.query'],
          },
        };
    }
  }

  private async insert(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = insertInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid records.insert input for database.records twin.', parsedInput.error.issues[0]?.message);
    }
    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    const recordId = deterministicSuffix(`${request.seed}:${input.table}:${JSON.stringify(input.record)}`);
    return {
      status: 'success',
      output: {
        table: input.table,
        record_id: recordId,
        record: input.record,
        inserted_at: new Date(request.timing.requested_at_ms).toISOString(),
        inserted_by: input.actor,
      },
      latency_ms: 4,
      metadata: {
        provider: 'database',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async update(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = updateInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid records.update input for database.records twin.', parsedInput.error.issues[0]?.message);
    }
    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }
    if (input.simulate === 'not_found') {
      return this.buildNotFound('Record', input.record_id);
    }

    return {
      status: 'success',
      output: {
        table: input.table,
        record_id: input.record_id,
        updates: input.updates,
        updated_at: new Date(request.timing.requested_at_ms).toISOString(),
        updated_by: input.actor,
      },
      latency_ms: 3,
      metadata: {
        provider: 'database',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async delete(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = deleteInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid records.delete input for database.records twin.', parsedInput.error.issues[0]?.message);
    }
    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }
    if (input.simulate === 'not_found') {
      return this.buildNotFound('Record', input.record_id);
    }

    return {
      status: 'success',
      output: {
        table: input.table,
        record_id: input.record_id,
        deleted_at: new Date(request.timing.requested_at_ms).toISOString(),
        deleted_by: input.actor,
      },
      latency_ms: 2,
      metadata: {
        provider: 'database',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async query(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = queryInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid records.query input for database.records twin.', parsedInput.error.issues[0]?.message);
    }
    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    const resultSeed = deterministicSuffix(`${request.seed}:${input.table}:${JSON.stringify(input.filter)}`);
    const records = Array.from({ length: Math.min(3, input.limit) }).map((_, index) => ({
      record_id: `${resultSeed}-${index + 1}`,
      ...input.filter,
    }));

    return {
      status: 'success',
      output: {
        table: input.table,
        records,
        limit: input.limit,
        queried_at: new Date(request.timing.requested_at_ms).toISOString(),
        queried_by: input.actor,
      },
      latency_ms: 5,
      metadata: {
        provider: 'database',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private simulateCommonErrors(simulate: string): TwinInvocationResult | null {
    if (simulate === 'auth_failed') {
      return {
        status: 'error',
        error: {
          code: 'auth_failed',
          class: 'auth',
          message: 'Authentication failed for database.records twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'database',
        },
      };
    }

    if (simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by database.records twin.',
          retryable: true,
          details: {
            retry_after_ms: 15000,
          },
        },
        latency_ms: 2,
        metadata: {
          provider: 'database',
        },
      };
    }

    if (simulate === 'timeout') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout in database.records twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 8,
        metadata: {
          provider: 'database',
        },
      };
    }

    return null;
  }

  private buildNotFound(entity: string, id: string): TwinInvocationResult {
    return {
      status: 'error',
      error: {
        code: 'twin_not_found',
        class: 'not_found',
        message: `${entity} ${id} not found in database.records twin.`,
        retryable: false,
        details: {},
      },
      latency_ms: 2,
      metadata: {
        provider: 'database',
      },
    };
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
      metadata: {
        provider: 'database',
      },
    };
  }
}

function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 41 + char.charCodeAt(0)) % 1000000;
  }
  return String(hash).padStart(6, '0');
}
