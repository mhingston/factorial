import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const sendEmailInputSchema = z.object({
  to: z.string().email(),
  from: z.string().email(),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  template_id: z.string().optional(),
  dynamic_data: z.record(z.unknown()).optional(),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'invalid_email', 'bounced', 'dropped']).default('none'),
});

const getTemplateInputSchema = z.object({
  template_id: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'not_found']).default('none'),
});

const createTemplateInputSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  html_content: z.string().min(1),
  plain_content: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'duplicate_name']).default('none'),
});

const getStatsInputSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'invalid_date_range']).default('none'),
});

const processWebhookInputSchema = z.object({
  event_type: z.enum(['delivered', 'bounce', 'drop', 'open', 'click', 'spam_report', 'unsubscribe']),
  email: z.string().email(),
  message_id: z.string().min(1),
  reason: z.string().optional(),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'invalid_signature', 'rate_limited', 'timeout']).default('none'),
});

const validateEmailInputSchema = z.object({
  email: z.string().email(),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'timeout', 'invalid_email']).default('none'),
});

export class SendGridTwinStub implements TwinContract {
  readonly twin_id = 'sendgrid';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    switch (request.operation) {
      case 'email.send':
        return this.sendEmail(request);
      case 'templates.get':
        return this.getTemplate(request);
      case 'templates.create':
        return this.createTemplate(request);
      case 'stats.get':
        return this.getStats(request);
      case 'webhooks.process':
        return this.processWebhook(request);
      case 'email.validate':
        return this.validateEmail(request);
      default:
        return {
          status: 'error',
          error: {
            code: 'operation_not_supported',
            class: 'spec_mismatch',
            message: `Unsupported operation for sendgrid twin: ${request.operation}`,
            retryable: false,
            details: {},
          },
          latency_ms: 1,
          metadata: {
            supported_operations: [
              'email.send',
              'templates.get',
              'templates.create',
              'stats.get',
              'webhooks.process',
              'email.validate',
            ],
          },
        };
    }
  }

  private async sendEmail(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = sendEmailInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid email.send input for sendgrid twin.', parsedInput.error.issues[0]?.message);
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
          details: { field: 'to' },
        },
        latency_ms: 2,
        metadata: { provider: 'sendgrid' },
      };
    }

    if (input.simulate === 'bounced') {
      return {
        status: 'error',
        error: {
          code: 'internal_error',
          class: 'transient',
          message: 'Email address bounced.',
          retryable: false,
          details: { bounce_type: 'hard_bounce' },
        },
        latency_ms: 5,
        metadata: { provider: 'sendgrid' },
      };
    }

    if (input.simulate === 'dropped') {
      return {
        status: 'error',
        error: {
          code: 'internal_error',
          class: 'transient',
          message: 'Email was dropped.',
          retryable: false,
          details: { reason: 'invalid_domain' },
        },
        latency_ms: 4,
        metadata: { provider: 'sendgrid' },
      };
    }

    const messageId = deterministicSuffix(`${request.seed}:${input.to}:${input.subject}`);
    return {
      status: 'success',
      output: {
        message_id: `msg_${messageId}`,
        to: input.to,
        from: input.from,
        subject: input.subject,
        status: 'queued',
        template_id: input.template_id ?? null,
        sent_at: new Date(request.timing.requested_at_ms).toISOString(),
        sent_by: input.actor,
      },
      latency_ms: 8,
      metadata: {
        provider: 'sendgrid',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async getTemplate(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = getTemplateInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid templates.get input for sendgrid twin.', parsedInput.error.issues[0]?.message);
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
          message: `Template ${input.template_id} not found.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'sendgrid' },
      };
    }

    return {
      status: 'success',
      output: {
        id: input.template_id,
        name: `Template ${input.template_id}`,
        subject: 'Sample Template Subject',
        html_content: '<html><body>Sample content</body></html>',
        plain_content: 'Sample plain content',
        generation: 'dynamic',
        updated_at: new Date(request.timing.requested_at_ms - 86400000).toISOString(),
        fetched_by: input.actor,
      },
      latency_ms: 5,
      metadata: {
        provider: 'sendgrid',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async createTemplate(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = createTemplateInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid templates.create input for sendgrid twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'duplicate_name') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: `Template with name "${input.name}" already exists.`,
          retryable: false,
          details: { field: 'name' },
        },
        latency_ms: 3,
        metadata: { provider: 'sendgrid' },
      };
    }

    const templateId = deterministicSuffix(`${request.seed}:${input.name}`);
    return {
      status: 'success',
      output: {
        id: `d-${templateId}`,
        name: input.name,
        subject: input.subject,
        html_content: input.html_content,
        plain_content: input.plain_content,
        generation: 'dynamic',
        created_at: new Date(request.timing.requested_at_ms).toISOString(),
        created_by: input.actor,
      },
      latency_ms: 10,
      metadata: {
        provider: 'sendgrid',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async getStats(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = getStatsInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid stats.get input for sendgrid twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'invalid_date_range') {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid date range.',
          retryable: false,
          details: { start_date: input.start_date, end_date: input.end_date },
        },
        latency_ms: 2,
        metadata: { provider: 'sendgrid' },
      };
    }

    const statsSeed = deterministicSuffix(`${request.seed}:${input.start_date}:${input.end_date}`);
    return {
      status: 'success',
      output: {
        date_range: {
          start: input.start_date,
          end: input.end_date,
        },
        metrics: {
          requests: 1000 + parseInt(statsSeed.slice(0, 3), 10),
          delivered: 950 + parseInt(statsSeed.slice(1, 3), 10),
          opens: 450 + parseInt(statsSeed.slice(2, 4), 10),
          clicks: 120 + parseInt(statsSeed.slice(3, 5), 10),
          bounces: 30 + parseInt(statsSeed.slice(0, 2), 10),
          spam_reports: 5 + parseInt(statsSeed.slice(1, 2), 10),
          unsubscribes: 10 + parseInt(statsSeed.slice(2, 3), 10),
        },
        fetched_at: new Date(request.timing.requested_at_ms).toISOString(),
        fetched_by: input.actor,
      },
      latency_ms: 6,
      metadata: {
        provider: 'sendgrid',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async processWebhook(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = processWebhookInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid webhooks.process input for sendgrid twin.', parsedInput.error.issues[0]?.message);
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
        metadata: { provider: 'sendgrid' },
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
        email: input.email,
        message_id: input.message_id,
        processed_at: new Date(request.timing.requested_at_ms).toISOString(),
        processed_by: input.actor,
        reason: input.reason ?? null,
      },
      latency_ms: 3,
      metadata: {
        provider: 'sendgrid',
        parity_profile: 'dtu-complete',
      },
    };
  }

  private async validateEmail(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = validateEmailInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return this.buildMalformedResponse('Invalid email.validate input for sendgrid twin.', parsedInput.error.issues[0]?.message);
    }

    const input = parsedInput.data;
    const simulated = this.simulateCommonErrors(input.simulate);
    if (simulated) {
      return simulated;
    }

    if (input.simulate === 'invalid_email') {
      return {
        status: 'success',
        output: {
          email: input.email,
          valid: false,
          verdict: 'Invalid',
          score: 0,
          checks: {
            domain: { valid: false, reason: 'Domain does not exist' },
            mx: { valid: false },
            syntax: { valid: false },
          },
          validated_at: new Date(request.timing.requested_at_ms).toISOString(),
          validated_by: input.actor,
        },
        latency_ms: 4,
        metadata: { provider: 'sendgrid' },
      };
    }

    return {
      status: 'success',
      output: {
        email: input.email,
        valid: true,
        verdict: 'Valid',
        score: 0.95,
        checks: {
          domain: { valid: true },
          mx: { valid: true },
          syntax: { valid: true },
        },
        validated_at: new Date(request.timing.requested_at_ms).toISOString(),
        validated_by: input.actor,
      },
      latency_ms: 5,
      metadata: {
        provider: 'sendgrid',
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
          message: 'Authentication failed for sendgrid twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: { provider: 'sendgrid' },
      };
    }

    if (simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by sendgrid twin.',
          retryable: true,
          details: { retry_after_ms: 10000 },
        },
        latency_ms: 2,
        metadata: { provider: 'sendgrid' },
      };
    }

    if (simulate === 'timeout') {
      return {
        status: 'error',
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout in sendgrid twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 12,
        metadata: { provider: 'sendgrid' },
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
      metadata: { provider: 'sendgrid' },
    };
  }
}

function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 59 + char.charCodeAt(0)) % 1000000;
  }
  return String(hash).padStart(6, '0');
}
