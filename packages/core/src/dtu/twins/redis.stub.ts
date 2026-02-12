import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const getInputSchema = z.object({
  key: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

const setInputSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  ttl_seconds: z.number().int().nonnegative().optional(),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

const deleteInputSchema = z.object({
  key: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

const publishInputSchema = z.object({
  channel: z.string().min(1),
  message: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

const subscribeInputSchema = z.object({
  channel: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

const listPushInputSchema = z.object({
  key: z.string().min(1),
  values: z.array(z.string()).min(1),
  side: z.enum(['left', 'right']).default('right'),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

const listRangeInputSchema = z.object({
  key: z.string().min(1),
  start: z.number().int().default(0),
  end: z.number().int().default(-1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

const setAddInputSchema = z.object({
  key: z.string().min(1),
  members: z.array(z.string()).min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

const setMembersInputSchema = z.object({
  key: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

export class RedisTwinStub implements TwinContract {
  readonly twin_id = 'redis';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    switch (request.operation) {
      case 'kv.get':
        return this.get(request);
      case 'kv.set':
        return this.set(request);
      case 'kv.delete':
        return this.delete(request);
      case 'pubsub.publish':
        return this.publish(request);
      case 'pubsub.subscribe':
        return this.subscribe(request);
      case 'list.push':
        return this.listPush(request);
      case 'list.range':
        return this.listRange(request);
      case 'set.add':
        return this.setAdd(request);
      case 'set.members':
        return this.setMembers(request);
      default:
        return {
          status: 'error',
          error: {
            code: 'operation_not_supported',
            class: 'spec_mismatch',
            message: `Unsupported operation for redis twin: ${request.operation}`,
            retryable: false,
            details: {},
          },
          latency_ms: 1,
          metadata: {
            supported_operations: [
              'kv.get', 'kv.set', 'kv.delete',
              'pubsub.publish', 'pubsub.subscribe',
              'list.push', 'list.range',
              'set.add', 'set.members',
            ],
          },
        };
    }
  }

  private async get(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = getInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid kv.get input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'not_found') {
      return {
        status: 'success',
        output: {
          key: input.key,
          value: null,
          exists: false,
          fetched_at: new Date(request.timing.requested_at_ms).toISOString(),
          fetched_by: input.actor,
        },
        latency_ms: 1,
        metadata: { provider: 'redis' },
      };
    }

    return {
      status: 'success',
      output: {
        key: input.key,
        value: `value-${deterministicSuffix(`${request.seed}:${input.key}`)}`,
        exists: true,
        ttl_seconds: null,
        fetched_at: new Date(request.timing.requested_at_ms).toISOString(),
        fetched_by: input.actor,
      },
      latency_ms: 1,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async set(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = setInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid kv.set input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    return {
      status: 'success',
      output: {
        key: input.key,
        value: input.value,
        ttl_seconds: input.ttl_seconds ?? null,
        previous_value: null,
        set_at: new Date(request.timing.requested_at_ms).toISOString(),
        set_by: input.actor,
      },
      latency_ms: 2,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async delete(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = deleteInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid kv.delete input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'not_found') {
      return {
        status: 'success',
        output: {
          key: input.key,
          deleted: false,
          deleted_count: 0,
          deleted_at: new Date(request.timing.requested_at_ms).toISOString(),
          deleted_by: input.actor,
        },
        latency_ms: 1,
        metadata: { provider: 'redis' },
      };
    }

    return {
      status: 'success',
      output: {
        key: input.key,
        deleted: true,
        deleted_count: 1,
        deleted_at: new Date(request.timing.requested_at_ms).toISOString(),
        deleted_by: input.actor,
      },
      latency_ms: 1,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async publish(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = publishInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid pubsub.publish input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    return {
      status: 'success',
      output: {
        channel: input.channel,
        message_id: deterministicSuffix(`${request.seed}:${input.channel}:${input.message}`),
        subscribers_received: 2,
        published_at: new Date(request.timing.requested_at_ms).toISOString(),
        published_by: input.actor,
      },
      latency_ms: 2,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async subscribe(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = subscribeInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid pubsub.subscribe input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    const subscriptionId = deterministicSuffix(`${request.seed}:${input.channel}`);
    return {
      status: 'success',
      output: {
        channel: input.channel,
        subscription_id: `sub_${subscriptionId}`,
        pattern: false,
        subscribed_at: new Date(request.timing.requested_at_ms).toISOString(),
        subscribed_by: input.actor,
      },
      latency_ms: 3,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async listPush(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = listPushInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid list.push input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    return {
      status: 'success',
      output: {
        key: input.key,
        list_length: input.values.length + 2,
        pushed_count: input.values.length,
        side: input.side,
        pushed_at: new Date(request.timing.requested_at_ms).toISOString(),
        pushed_by: input.actor,
      },
      latency_ms: 2,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async listRange(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = listRangeInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid list.range input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'not_found') {
      return {
        status: 'success',
        output: {
          key: input.key,
          values: [],
          start: input.start,
          end: input.end,
          list_length: 0,
          fetched_at: new Date(request.timing.requested_at_ms).toISOString(),
          fetched_by: input.actor,
        },
        latency_ms: 1,
        metadata: { provider: 'redis' },
      };
    }

    const values = Array.from({ length: Math.min(5, input.end === -1 ? 5 : input.end - input.start + 1) }).map((_, i) =>
      `item_${deterministicSuffix(`${request.seed}:${input.key}:${i}`)}`
    );

    return {
      status: 'success',
      output: {
        key: input.key,
        values,
        start: input.start,
        end: input.end,
        list_length: values.length,
        fetched_at: new Date(request.timing.requested_at_ms).toISOString(),
        fetched_by: input.actor,
      },
      latency_ms: 2,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async setAdd(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = setAddInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid set.add input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    return {
      status: 'success',
      output: {
        key: input.key,
        added_count: input.members.length,
        set_cardinality: input.members.length + 3,
        added_at: new Date(request.timing.requested_at_ms).toISOString(),
        added_by: input.actor,
      },
      latency_ms: 2,
      metadata: {
        provider: 'redis',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async setMembers(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = setMembersInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid set.members input for redis twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'not_found') {
      return {
        status: 'success',
        output: {
          key: input.key,
          members: [],
          cardinality: 0,
          fetched_at: new Date(request.timing.requested_at_ms).toISOString(),
          fetched_by: input.actor,
        },
        latency_ms: 1,
        metadata: { provider: 'redis' },
      };
    }

    return {
      status: 'success',
      output: {
        key: input.key,
        members: [
          `member_a_${deterministicSuffix(`${request.seed}:${input.key}:a`)}`,
          `member_b_${deterministicSuffix(`${request.seed}:${input.key}:b`)}`,
          `member_c_${deterministicSuffix(`${request.seed}:${input.key}:c`)}`,
        ],
        cardinality: 3,
        fetched_at: new Date(request.timing.requested_at_ms).toISOString(),
        fetched_by: input.actor,
      },
      latency_ms: 2,
      metadata: {
        provider: 'redis',
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
          message: 'Authentication failed for redis twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'redis' },
      };
    }

    if (simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by redis twin.',
          retryable: true,
          details: { retry_after_ms: 100 },
        },
        latency_ms: 2,
        metadata: { provider: 'redis' },
      };
    }

    if (simulate === 'timeout') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout in redis twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 10,
        metadata: { provider: 'redis' },
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
      metadata: { provider: 'redis' },
    };
  }
}

function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 43 + char.charCodeAt(0)) % 1000000;
  }
  return String(hash).padStart(6, '0');
}
