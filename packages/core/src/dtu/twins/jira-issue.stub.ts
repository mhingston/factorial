import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const createIssueInputSchema = z.object({
  project_key: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().default(''),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited']).default('none'),
});

export class JiraIssueTwinStub implements TwinContract {
  readonly twin_id = 'jira.issue';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    if (request.operation !== 'issues.create') {
      return {
        status: 'error',
        error: {
          code: 'operation_not_supported',
          class: 'spec_mismatch',
          message: `Unsupported operation for jira.issue twin: ${request.operation}`,
          retryable: false,
          details: {},
        },
        latency_ms: 1,
        metadata: {
          supported_operations: ['issues.create'],
        },
      };
    }

    const parsedInput = createIssueInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid issues.create input for jira.issue twin.',
          retryable: false,
          details: {
            validation_error: parsedInput.error.issues[0]?.message || 'invalid payload',
          },
        },
        latency_ms: 1,
        metadata: {
          provider: 'jira',
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
          message: 'Authentication failed for jira.issue twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 3,
        metadata: {
          provider: 'jira',
          parity_profile: 'phase-a',
        },
      };
    }

    if (input.simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limited by jira.issue twin.',
          retryable: true,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'jira',
          parity_profile: 'phase-a',
        },
      };
    }

    const issueSuffix = deterministicSuffix(`${request.seed}:${input.project_key}:${input.summary}:${input.actor}`);
    const issue_key = `${input.project_key}-${issueSuffix}`;

    return {
      status: 'success',
      output: {
        issue_key,
        summary: input.summary,
        description: input.description,
        status: 'OPEN',
        assignee: input.actor,
        link: `https://jira.twin.local/browse/${issue_key}`,
      },
      latency_ms: 12,
      metadata: {
        provider: 'jira',
        parity_profile: 'phase-a',
      },
    };
  }
}

function deterministicSuffix(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return String(hash).padStart(4, '0');
}
