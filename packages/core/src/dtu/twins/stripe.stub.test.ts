import { describe, expect, it } from 'vitest';
import type { TwinInvocationRequest } from '../contracts.js';
import { StripeTwinStub } from './stripe.stub.js';

describe('StripeTwinStub', () => {
  const twin = new StripeTwinStub();
  const baseTiming = { requested_at_ms: 1700000000000, timeout_ms: 1000 };

  it('creates a customer', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'customers.create',
      scenario_id: 'scenario-1',
      seed: 'seed-1',
      input: {
        email: 'test@example.com',
        name: 'Test Customer',
        metadata: { plan: 'premium' },
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.email).toBe('test@example.com');
    expect(result.output.name).toBe('Test Customer');
    expect(result.output.id).toMatch(/^cus_/);
  });

  it('creates a payment', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'payments.create',
      scenario_id: 'scenario-2',
      seed: 'seed-2',
      input: {
        customer_id: 'cus_12345',
        amount: 5000,
        currency: 'usd',
        description: 'Test payment',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.amount).toBe(5000);
    expect(result.output.currency).toBe('usd');
    expect(result.output.id).toMatch(/^pi_/);
    expect(result.output.status).toBe('succeeded');
  });

  it('creates a refund', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'refunds.create',
      scenario_id: 'scenario-3',
      seed: 'seed-3',
      input: {
        payment_id: 'pi_12345',
        amount: 2500,
        reason: 'requested_by_customer',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.payment_id).toBe('pi_12345');
    expect(result.output.id).toMatch(/^re_/);
  });

  it('processes webhook events', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'webhooks.process',
      scenario_id: 'scenario-4',
      seed: 'seed-4',
      input: {
        event_type: 'payment_intent.succeeded',
        payload: { id: 'pi_123' },
        signature: 'sig_test',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.received).toBe(true);
    expect(result.output.event_type).toBe('payment_intent.succeeded');
  });

  it('handles rate limit simulation', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'customers.create',
      scenario_id: 'scenario-5',
      seed: 'seed-5',
      input: {
        email: 'test@example.com',
        name: 'Test',
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

  it('handles card declined simulation', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'payments.create',
      scenario_id: 'scenario-6',
      seed: 'seed-6',
      input: {
        customer_id: 'cus_123',
        amount: 1000,
        actor: 'tester',
        simulate: 'card_declined',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('auth_failed');
  });

  it('rejects unsupported operations', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'unsupported.op',
      scenario_id: 'scenario-7',
      seed: 'seed-7',
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
      twin_id: 'stripe',
      operation: 'customers.create',
      scenario_id: 'scenario-8',
      seed: 'seed-8',
      input: {
        email: 'invalid-email',
        name: '',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('malformed_request');
  });

  it('gets customer by id', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'customers.get',
      scenario_id: 'scenario-9',
      seed: 'seed-9',
      input: {
        customer_id: 'cus_test123',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.id).toBe('cus_test123');
    expect(result.output.email).toContain('customer-cus_test123');
  });

  it('handles not found for customer', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'stripe',
      operation: 'customers.get',
      scenario_id: 'scenario-10',
      seed: 'seed-10',
      input: {
        customer_id: 'cus_missing',
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
