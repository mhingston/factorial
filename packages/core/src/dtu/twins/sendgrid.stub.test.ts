import { describe, expect, it } from 'vitest';
import type { TwinInvocationRequest } from '../contracts.js';
import { SendGridTwinStub } from './sendgrid.stub.js';

describe('SendGridTwinStub', () => {
  const twin = new SendGridTwinStub();
  const baseTiming = { requested_at_ms: 1700000000000, timeout_ms: 1000 };

  it('sends an email', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'email.send',
      scenario_id: 'scenario-1',
      seed: 'seed-1',
      input: {
        to: 'recipient@example.com',
        from: 'sender@example.com',
        subject: 'Test Email',
        text: 'This is a test email',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.to).toBe('recipient@example.com');
    expect(result.output.from).toBe('sender@example.com');
    expect(result.output.subject).toBe('Test Email');
    expect(result.output.message_id).toMatch(/^msg_/);
    expect(result.output.status).toBe('queued');
  });

  it('gets a template', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'templates.get',
      scenario_id: 'scenario-2',
      seed: 'seed-2',
      input: {
        template_id: 'd-1234567890abcdef',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.id).toBe('d-1234567890abcdef');
    expect(result.output.name).toBeDefined();
    expect(result.output.html_content).toBeDefined();
  });

  it('creates a template', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'templates.create',
      scenario_id: 'scenario-3',
      seed: 'seed-3',
      input: {
        name: 'Welcome Email Template',
        subject: 'Welcome to our service!',
        html_content: '<html><body><h1>Welcome!</h1></body></html>',
        plain_content: 'Welcome to our service!',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.name).toBe('Welcome Email Template');
    expect(result.output.id).toMatch(/^d-/);
    expect(result.output.generation).toBe('dynamic');
  });

  it('gets email stats', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'stats.get',
      scenario_id: 'scenario-4',
      seed: 'seed-4',
      input: {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.date_range).toBeDefined();
    expect(result.output.metrics).toBeDefined();
    expect(result.output.metrics.requests).toBeGreaterThan(0);
    expect(result.output.metrics.delivered).toBeGreaterThan(0);
  });

  it('processes webhook events', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'webhooks.process',
      scenario_id: 'scenario-5',
      seed: 'seed-5',
      input: {
        event_type: 'delivered',
        email: 'user@example.com',
        message_id: 'msg_12345',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.received).toBe(true);
    expect(result.output.event_type).toBe('delivered');
    expect(result.output.email).toBe('user@example.com');
  });

  it('validates email address', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'email.validate',
      scenario_id: 'scenario-6',
      seed: 'seed-6',
      input: {
        email: 'valid@example.com',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.email).toBe('valid@example.com');
    expect(result.output.valid).toBe(true);
    expect(result.output.score).toBeGreaterThan(0);
  });

  it('handles template not found', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'templates.get',
      scenario_id: 'scenario-7',
      seed: 'seed-7',
      input: {
        template_id: 'd-missing',
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

  it('handles rate limit simulation', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'email.send',
      scenario_id: 'scenario-8',
      seed: 'seed-8',
      input: {
        to: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Test',
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

  it('handles bounce simulation', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'email.send',
      scenario_id: 'scenario-9',
      seed: 'seed-9',
      input: {
        to: 'bounce@example.com',
        from: 'sender@example.com',
        subject: 'Test',
        actor: 'tester',
        simulate: 'bounced',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('internal_error');
  });

  it('handles duplicate template name', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'templates.create',
      scenario_id: 'scenario-10',
      seed: 'seed-10',
      input: {
        name: 'Existing Template',
        subject: 'Subject',
        html_content: '<p>Content</p>',
        plain_content: 'Content',
        actor: 'tester',
        simulate: 'duplicate_name',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('malformed_request');
  });

  it('rejects unsupported operations', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
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

  it('rejects malformed input', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'sendgrid',
      operation: 'email.send',
      scenario_id: 'scenario-12',
      seed: 'seed-12',
      input: {
        to: 'invalid-email',
        from: 'sender@example.com',
        subject: 'Test',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('malformed_request');
  });
});
