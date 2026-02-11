import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const postMessageInputSchema = z.object({
  channel_id: z.string().min(1),
  text: z.string().min(1),
  actor: z.string().min(1),
  simulate: z
    .enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'partial_outage'])
    .default('none'),
});

export class SlackChannelTwinStub implements TwinContract {
  readonly twin_id = 'slack.channel';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    if (request.operation !== 'messages.post') {
      return {
        status: 'error',
        error: {
          code: 'operation_not_supported',
          class: 'spec_mismatch',
          message: `Unsupported operation for slack.channel twin: ${request.operation}`,
          retryable: false,
          details: {},
        },
        latency_ms: 1,
        metadata: {
          supported_operations: ['messages.post'],
        },
      };
    }

    const parsedInput = postMessageInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid messages.post input for slack.channel twin.',
          retryable: false,
          details: {
            validation_error: parsedInput.error.issues[0]?.message || 'invalid payload',
          },
        },
        latency_ms: 1,
        metadata: {
          provider: 'slack',
        },
      };
    }

    const input = parsedInput.data;
    if (input.simulate === 'auth_failed') {
      return {
        status: 'error',
        error: {
          code: 'auth_failed',
          class: 'auth',
          message: 'Authentication failed for slack.channel twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'slack',
          parity_profile: 'dtu-complete',
        },
      };
    }

    if (input.simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by slack.channel twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'slack',
          parity_profile: 'dtu-complete',
        },
      };
    }

    if (input.simulate === 'timeout') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout reached while posting message in slack.channel twin.',
          retryable: true,
          details: {},
        },
        latency_ms: Math.max(1, Math.min(2000, request.timing.timeout_ms)),
        metadata: {
          provider: 'slack',
          parity_profile: 'dtu-complete',
        },
      };
    }

    if (input.simulate === 'partial_outage') {
      return {
        status: 'error',
        error: {
          code: 'partial_outage',
          class: 'transient',
          message: 'Partial outage in slack.channel twin.',
          retryable: true,
          details: {
            outage_scope: 'messages_api',
          },
        },
        latency_ms: 5,
        metadata: {
          provider: 'slack',
          parity_profile: 'dtu-complete',
        },
      };
    }

    const messageSuffix = deterministicSuffix(
      `${request.seed}:${input.channel_id}:${input.text}:${input.actor}`
    );
    const message_id = `msg-${messageSuffix}`;

    return {
      status: 'success',
      output: {
        channel_id: input.channel_id,
        message_id,
        actor: input.actor,
        text: input.text,
        permalink: `https://slack.twin.local/archives/${input.channel_id}/p${messageSuffix}`,
      },
      latency_ms: 8,
      metadata: {
        provider: 'slack',
        parity_profile: 'dtu-complete',
      },
    };
  }
}

function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 33 + char.charCodeAt(0)) % 1000000;
  }
  return String(hash).padStart(6, '0');
}
