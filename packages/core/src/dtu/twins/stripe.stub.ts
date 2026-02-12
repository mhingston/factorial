import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const createCustomerInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  metadata: z.record(z.string()).default({}),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'invalid_email']).default('none'),
});

const createPaymentInputSchema = z.object({
  customer_id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('usd'),
  description: z.string().default(''),
  metadata: z.record(z.string()).default({}),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'card_declined', 'insufficient_funds', 'invalid_customer']).default('none'),
});

const createRefundInputSchema = z.object({
  payment_id: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'invalid_payment', 'already_refunded']).default('none'),
});

const processWebhookInputSchema = z.object({
  event_type: z.enum(['payment_intent.succeeded', 'payment_intent.payment_failed', 'customer.created', 'charge.refunded']),
  payload: z.record(z.unknown()),
  signature: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'invalid_signature', 'rate_limited', 'timeout']).default('none'),
});

const getCustomerInputSchema = z.object({
  customer_id: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

export class StripeTwinStub implements TwinContract {
  readonly twin_id = 'stripe';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    switch (request.operation) {
      case 'customers.create':
        return this.createCustomer(request);
      case 'customers.get':
        return this.getCustomer(request);
      case 'payments.create':
        return this.createPayment(request);
      case 'refunds.create':
        return this.createRefund(request);
      case 'webhooks.process':
        return this.processWebhook(request);
      default:
        return {
          status: 'error',
          error: {
            code: 'operation_not_supported',
            class: 'spec_mismatch',
            message: `Unsupported operation for stripe twin: ${request.operation}`,
            retryable: false,
            details: {},
          },
          latency_ms: 1,
          metadata: {
            supported_operations: [
              'customers.create',
              'customers.get',
              'payments.create',
              'refunds.create',
              'webhooks.process',
            ],
          },
        };
    }
  }

  private async createCustomer(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = createCustomerInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid customers.create input for stripe twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'invalid_email') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid email address format.',
          retryable: false,
          details: { field: 'email' },
        },
        latency_ms: 2,
        metadata: { provider: 'stripe' },
      };
    }

    const customerId = `cus_${deterministicSuffix(`${request.seed}:${input.email}`)}`;
    return {
      status: 'success',
      output: {
        id: customerId,
        email: input.email,
        name: input.name,
        metadata: input.metadata,
        created_at: new Date(request.timing.requested_at_ms).toISOString(),
        created_by: input.actor,
      },
      latency_ms: 8,
      metadata: {
        provider: 'stripe',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async getCustomer(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = getCustomerInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid customers.get input for stripe twin.', parsedInput.error.issues[0]?.message);
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
          message: `Customer ${input.customer_id} not found.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'stripe' },
      };
    }

    return {
      status: 'success',
      output: {
        id: input.customer_id,
        email: `customer-${input.customer_id}@example.com`,
        name: 'Test Customer',
        metadata: {},
        created_at: new Date(request.timing.requested_at_ms - 86400000).toISOString(),
        fetched_by: input.actor,
      },
      latency_ms: 5,
      metadata: {
        provider: 'stripe',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async createPayment(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = createPaymentInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid payments.create input for stripe twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'invalid_customer') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Customer ${input.customer_id} not found.`,
          retryable: false,
          details: { field: 'customer_id' },
        },
        latency_ms: 2,
        metadata: { provider: 'stripe' },
      };
    }

    if (input.simulate === 'card_declined') {
      return {
        status: 'error',
        error: {
          code: 'auth_failed',
          class: 'auth',
          message: 'Your card was declined.',
          retryable: false,
          details: { decline_code: 'card_declined' },
        },
        latency_ms: 4,
        metadata: { provider: 'stripe' },
      };
    }

    if (input.simulate === 'insufficient_funds') {
      return {
        status: 'error',
        error: {
          code: 'auth_failed',
          class: 'auth',
          message: 'Your card has insufficient funds.',
          retryable: false,
          details: { decline_code: 'insufficient_funds' },
        },
        latency_ms: 4,
        metadata: { provider: 'stripe' },
      };
    }

    const paymentId = `pi_${deterministicSuffix(`${request.seed}:${input.customer_id}:${input.amount}`)}`;
    return {
      status: 'success',
      output: {
        id: paymentId,
        customer_id: input.customer_id,
        amount: input.amount,
        currency: input.currency.toLowerCase(),
        description: input.description,
        metadata: input.metadata,
        status: 'succeeded',
        created_at: new Date(request.timing.requested_at_ms).toISOString(),
        created_by: input.actor,
      },
      latency_ms: 12,
      metadata: {
        provider: 'stripe',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async createRefund(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = createRefundInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid refunds.create input for stripe twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'invalid_payment') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Payment ${input.payment_id} not found.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'stripe' },
      };
    }

    if (input.simulate === 'already_refunded') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Charge has already been refunded.',
          retryable: false,
          details: {},
        },
        latency_ms: 3,
        metadata: { provider: 'stripe' },
      };
    }

    const refundId = `re_${deterministicSuffix(`${request.seed}:${input.payment_id}`)}`;
    return {
      status: 'success',
      output: {
        id: refundId,
        payment_id: input.payment_id,
        amount: input.amount,
        reason: input.reason,
        status: 'succeeded',
        created_at: new Date(request.timing.requested_at_ms).toISOString(),
        created_by: input.actor,
      },
      latency_ms: 10,
      metadata: {
        provider: 'stripe',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async processWebhook(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = processWebhookInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid webhooks.process input for stripe twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;

    if (input.simulate === 'invalid_signature') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid webhook signature.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'stripe' },
      };
    }

    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    return {
      status: 'success',
      output: {
        received: true,
        event_type: input.event_type,
        event_id: `evt_${deterministicSuffix(`${request.seed}:${input.event_type}`)}`,
        processed_at: new Date(request.timing.requested_at_ms).toISOString(),
        processed_by: input.actor,
      },
      latency_ms: 3,
      metadata: {
        provider: 'stripe',
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
          message: 'Authentication failed for stripe twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'stripe' },
      };
    }

    if (simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by stripe twin.',
          retryable: true,
          details: { retry_after_ms: 60000 },
        },
        latency_ms: 2,
        metadata: { provider: 'stripe' },
      };
    }

    if (simulate === 'timeout') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout in stripe twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 15,
        metadata: { provider: 'stripe' },
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
      metadata: { provider: 'stripe' },
    };
  }
}

function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 53 + char.charCodeAt(0)) % 1000000;
  }
  return String(hash).padStart(6, '0');
}
