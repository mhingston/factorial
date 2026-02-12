import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const createBucketInputSchema = z.object({
  bucket: z.string().min(3),
  region: z.string().min(1).default('us-east-1'),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout']).default('none'),
});

const putObjectInputSchema = z.object({
  bucket: z.string().min(3),
  key: z.string().min(1),
  content: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'bucket_not_found']).default('none'),
});

const getObjectInputSchema = z.object({
  bucket: z.string().min(3),
  key: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

const deleteObjectInputSchema = z.object({
  bucket: z.string().min(3),
  key: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

export class AwsS3TwinStub implements TwinContract {
  readonly twin_id = 'aws.s3';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    switch (request.operation) {
      case 'buckets.create':
        return this.createBucket(request);
      case 'objects.put':
        return this.putObject(request);
      case 'objects.get':
        return this.getObject(request);
      case 'objects.delete':
        return this.deleteObject(request);
      default:
        return {
          status: 'error',
          error: {
            code: 'operation_not_supported',
            class: 'spec_mismatch',
            message: `Unsupported operation for aws.s3 twin: ${request.operation}`,
            retryable: false,
            details: {},
          },
          latency_ms: 1,
          metadata: {
            supported_operations: ['buckets.create', 'objects.put', 'objects.get', 'objects.delete'],
          },
        };
    }
  }

  private async createBucket(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = createBucketInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid buckets.create input for aws.s3 twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    const bucketSuffix = deterministicSuffix(`${request.seed}:${input.bucket}:${input.region}:${input.actor}`);
    return {
      status: 'success',
      output: {
        bucket: input.bucket,
        region: input.region,
        arn: `arn:aws:s3:::${input.bucket}`,
        created_by: input.actor,
        created_at: new Date(request.timing.requested_at_ms).toISOString(),
        idempotency_key: bucketSuffix,
      },
      latency_ms: 6,
      metadata: {
        provider: 'aws',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async putObject(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = putObjectInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid objects.put input for aws.s3 twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'bucket_not_found') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Bucket ${input.bucket} not found in aws.s3 twin.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'aws',
        },
      };
    }

    const etag = deterministicSuffix(`${request.seed}:${input.bucket}:${input.key}:${input.content}`);
    return {
      status: 'success',
      output: {
        bucket: input.bucket,
        key: input.key,
        etag: `"${etag}"`,
        size_bytes: input.content.length,
        stored_at: new Date(request.timing.requested_at_ms).toISOString(),
        stored_by: input.actor,
      },
      latency_ms: 5,
      metadata: {
        provider: 'aws',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async getObject(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = getObjectInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid objects.get input for aws.s3 twin.', parsedInput.error.issues[0]?.message);
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
          message: `Object ${input.key} not found in ${input.bucket}.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'aws',
        },
      };
    }

    const etag = deterministicSuffix(`${request.seed}:${input.bucket}:${input.key}`);
    return {
      status: 'success',
      output: {
        bucket: input.bucket,
        key: input.key,
        etag: `"${etag}"`,
        last_modified: new Date(request.timing.requested_at_ms).toISOString(),
        content: `stub-content-${etag}`,
      },
      latency_ms: 4,
      metadata: {
        provider: 'aws',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async deleteObject(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = deleteObjectInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid objects.delete input for aws.s3 twin.', parsedInput.error.issues[0]?.message);
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
          message: `Object ${input.key} not found in ${input.bucket}.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'aws',
        },
      };
    }

    return {
      status: 'success',
      output: {
        bucket: input.bucket,
        key: input.key,
        deleted_at: new Date(request.timing.requested_at_ms).toISOString(),
        deleted_by: input.actor,
      },
      latency_ms: 3,
      metadata: {
        provider: 'aws',
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
          message: 'Authentication failed for aws.s3 twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'aws',
        },
      };
    }

    if (simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by aws.s3 twin.',
          retryable: true,
          details: {
            retry_after_ms: 30000,
          },
        },
        latency_ms: 2,
        metadata: {
          provider: 'aws',
        },
      };
    }

    if (simulate === 'timeout') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout in aws.s3 twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 10,
        metadata: {
          provider: 'aws',
        },
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
      metadata: {
        provider: 'aws',
      },
    };
  }
}

/**
 * Generates a deterministic suffix from a string input for DTU testing.
 * Uses a simple hash algorithm (multiplier 37, modulo 1,000,000).
 *
 * Note: This is designed for deterministic testing only. The simple hash
 * with limited range may produce collisions for different inputs, which
 * is acceptable for test scenarios but not for production use.
 */
function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 37 + char.charCodeAt(0)) % 1000000;
  }
  return String(hash).padStart(6, '0');
}
