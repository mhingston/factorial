import { z } from 'zod';

export const twinErrorClassSchema = z.enum([
  'auth',
  'rate_limit',
  'transient',
  'spec_mismatch',
  'not_found',
]);

export type TwinErrorClass = z.infer<typeof twinErrorClassSchema>;

export const twinErrorCodeSchema = z.enum([
  'auth_failed',
  'rate_limited',
  'timeout',
  'partial_outage',
  'malformed_request',
  'twin_not_found',
  'operation_not_supported',
  'internal_error',
]);

export type TwinErrorCode = z.infer<typeof twinErrorCodeSchema>;

export const twinErrorSchema = z.object({
  code: twinErrorCodeSchema,
  class: twinErrorClassSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.unknown()).default({}),
});

export type TwinError = z.infer<typeof twinErrorSchema>;

export const twinRequestTimingSchema = z.object({
  requested_at_ms: z.number().int().nonnegative(),
  timeout_ms: z.number().int().positive(),
});

export type TwinRequestTiming = z.infer<typeof twinRequestTimingSchema>;

export const twinResponseTimingSchema = z.object({
  started_at_ms: z.number().int().nonnegative(),
  completed_at_ms: z.number().int().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  deterministic: z.literal(true),
});

export type TwinResponseTiming = z.infer<typeof twinResponseTimingSchema>;

export const twinInvocationRequestSchema = z.object({
  twin_id: z.string().min(1),
  operation: z.string().min(1),
  scenario_id: z.string().min(1),
  seed: z.string().min(1),
  input: z.unknown(),
  timing: twinRequestTimingSchema,
  metadata: z.record(z.unknown()).default({}),
});

export type TwinInvocationRequest = z.infer<typeof twinInvocationRequestSchema>;

const twinResponseBaseSchema = z.object({
  twin_id: z.string().min(1),
  twin_version: z.string().min(1),
  operation: z.string().min(1),
  timing: twinResponseTimingSchema,
  metadata: z.record(z.unknown()).default({}),
});

export const twinInvocationSuccessSchema = twinResponseBaseSchema.extend({
  status: z.literal('success'),
  output: z.unknown(),
  error: z.null(),
});

export type TwinInvocationSuccess = z.infer<typeof twinInvocationSuccessSchema>;

export const twinInvocationErrorSchema = twinResponseBaseSchema.extend({
  status: z.literal('error'),
  output: z.null(),
  error: twinErrorSchema,
});

export type TwinInvocationError = z.infer<typeof twinInvocationErrorSchema>;

export const twinInvocationResponseSchema = z.union([
  twinInvocationSuccessSchema,
  twinInvocationErrorSchema,
]);

export type TwinInvocationResponse = z.infer<typeof twinInvocationResponseSchema>;

export const twinParityFixtureSchema = z
  .object({
    fixture_id: z.string().min(1),
    description: z.string().min(1),
    request: twinInvocationRequestSchema,
    expected: twinInvocationResponseSchema,
  })
  .superRefine((fixture, ctx) => {
    if (fixture.request.twin_id !== fixture.expected.twin_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected', 'twin_id'],
        message: 'expected.twin_id must match request.twin_id',
      });
    }

    if (fixture.request.operation !== fixture.expected.operation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected', 'operation'],
        message: 'expected.operation must match request.operation',
      });
    }

    if (fixture.request.timing.requested_at_ms !== fixture.expected.timing.started_at_ms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected', 'timing', 'started_at_ms'],
        message: 'expected timing must start at request.timing.requested_at_ms',
      });
    }

    const expectedCompleted =
      fixture.expected.timing.started_at_ms + fixture.expected.timing.latency_ms;
    if (expectedCompleted !== fixture.expected.timing.completed_at_ms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected', 'timing', 'completed_at_ms'],
        message: 'completed_at_ms must equal started_at_ms + latency_ms',
      });
    }
  });

export type TwinParityFixture = z.infer<typeof twinParityFixtureSchema>;

export function parseTwinInvocationRequest(value: unknown): TwinInvocationRequest {
  return twinInvocationRequestSchema.parse(value);
}

export function parseTwinInvocationResponse(value: unknown): TwinInvocationResponse {
  return twinInvocationResponseSchema.parse(value);
}

export function parseTwinParityFixture(value: unknown): TwinParityFixture {
  return twinParityFixtureSchema.parse(value);
}
