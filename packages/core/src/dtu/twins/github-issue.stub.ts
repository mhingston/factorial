import { z } from 'zod';
import type { TwinInvocationRequest } from '../contracts.js';
import type { TwinContract, TwinInvocationResult } from '../runtime.js';

const createIssueInputSchema = z.object({
  repo: z.string().min(1),
  title: z.string().min(1),
  body: z.string().default(''),
  labels: z.array(z.string()).default([]),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'repo_not_found']).default('none'),
});

const addCommentInputSchema = z.object({
  repo: z.string().min(1),
  issue_number: z.number().int().positive(),
  body: z.string().min(1),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'issue_not_found']).default('none'),
});

const closeIssueInputSchema = z.object({
  repo: z.string().min(1),
  issue_number: z.number().int().positive(),
  actor: z.string().min(1),
  simulate: z.enum(['none', 'auth_failed', 'rate_limited', 'issue_not_found']).default('none'),
});

export class GitHubIssueTwinStub implements TwinContract {
  readonly twin_id = 'github.issue';
  readonly version = '0.1.0';

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    switch (request.operation) {
      case 'issues.create':
        return this.createIssue(request);
      case 'issues.add_comment':
        return this.addComment(request);
      case 'issues.close':
        return this.closeIssue(request);
      default:
        return {
          status: 'error',
          error: {
            code: 'operation_not_supported',
            class: 'spec_mismatch',
            message: `Unsupported operation for github.issue twin: ${request.operation}`,
            retryable: false,
            details: {},
          },
          latency_ms: 1,
          metadata: {
            supported_operations: ['issues.create', 'issues.add_comment', 'issues.close'],
          },
        };
    }
  }

  private async createIssue(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = createIssueInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid issues.create input for github.issue twin.',
          retryable: false,
          details: {
            validation_error: parsedInput.error.issues[0]?.message || 'invalid payload',
          },
        },
        latency_ms: 1,
        metadata: {
          provider: 'github',
        },
      };
    }

    const input = parsedInput.data;

    // Simulate failure modes per DTU failure catalog
    if (input.simulate === 'auth_failed') {
      return {
        status: 'error',
        error: {
          code: 'auth_failed',
          class: 'auth',
          message: 'Bad credentials for github.issue twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 3,
        metadata: {
          provider: 'github',
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
          message: 'API rate limit exceeded for github.issue twin.',
          retryable: true,
          details: {
            retry_after_ms: 60000,
          },
        },
        latency_ms: 2,
        metadata: {
          provider: 'github',
          parity_profile: 'phase-a',
        },
      };
    }

    if (input.simulate === 'repo_not_found') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Repository ${input.repo} not found.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'github',
          parity_profile: 'phase-a',
        },
      };
    }

    // Success case
    const issueNumber = deterministicNumber(`${request.seed}:${input.repo}:${input.title}:${input.actor}`);
    return {
      status: 'success',
      output: {
        issue_number: issueNumber,
        repo: input.repo,
        title: input.title,
        body: input.body,
        labels: input.labels,
        state: 'open',
        created_by: input.actor,
        created_at: new Date(request.timing.requested_at_ms).toISOString(),
        url: `https://github.com/${input.repo}/issues/${issueNumber}`,
      },
      latency_ms: 5,
      metadata: {
        provider: 'github',
        twin_id: this.twin_id,
        operation: 'issues.create',
      },
    };
  }

  private async addComment(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = addCommentInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid issues.add_comment input for github.issue twin.',
          retryable: false,
          details: {
            validation_error: parsedInput.error.issues[0]?.message || 'invalid payload',
          },
        },
        latency_ms: 1,
        metadata: {
          provider: 'github',
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
          message: 'Bad credentials for github.issue twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 3,
        metadata: {
          provider: 'github',
        },
      };
    }

    if (input.simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'API rate limit exceeded for github.issue twin.',
          retryable: true,
          details: {
            retry_after_ms: 60000,
          },
        },
        latency_ms: 2,
        metadata: {
          provider: 'github',
        },
      };
    }

    if (input.simulate === 'issue_not_found') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Issue #${input.issue_number} not found in ${input.repo}.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'github',
        },
      };
    }

    // Success case
    const commentId = deterministicNumber(`${request.seed}:${input.repo}:${input.issue_number}:${input.body}`);
    return {
      status: 'success',
      output: {
        comment_id: commentId,
        repo: input.repo,
        issue_number: input.issue_number,
        body: input.body,
        created_by: input.actor,
        created_at: new Date(request.timing.requested_at_ms).toISOString(),
        url: `https://github.com/${input.repo}/issues/${input.issue_number}#issuecomment-${commentId}`,
      },
      latency_ms: 3,
      metadata: {
        provider: 'github',
        twin_id: this.twin_id,
        operation: 'issues.add_comment',
      },
    };
  }

  private async closeIssue(request: TwinInvocationRequest): Promise<TwinInvocationResult> {
    const parsedInput = closeIssueInputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          class: 'spec_mismatch',
          message: 'Invalid issues.close input for github.issue twin.',
          retryable: false,
          details: {
            validation_error: parsedInput.error.issues[0]?.message || 'invalid payload',
          },
        },
        latency_ms: 1,
        metadata: {
          provider: 'github',
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
          message: 'Bad credentials for github.issue twin.',
          retryable: false,
          details: {},
        },
        latency_ms: 3,
        metadata: {
          provider: 'github',
        },
      };
    }

    if (input.simulate === 'rate_limited') {
      return {
        status: 'error',
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'API rate limit exceeded for github.issue twin.',
          retryable: true,
          details: {
            retry_after_ms: 60000,
          },
        },
        latency_ms: 2,
        metadata: {
          provider: 'github',
        },
      };
    }

    if (input.simulate === 'issue_not_found') {
      return {
        status: 'error',
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Issue #${input.issue_number} not found in ${input.repo}.`,
          retryable: false,
          details: {},
        },
        latency_ms: 2,
        metadata: {
          provider: 'github',
        },
      };
    }

    // Success case
    return {
      status: 'success',
      output: {
        repo: input.repo,
        issue_number: input.issue_number,
        state: 'closed',
        closed_by: input.actor,
        closed_at: new Date(request.timing.requested_at_ms).toISOString(),
        url: `https://github.com/${input.repo}/issues/${input.issue_number}`,
      },
      latency_ms: 3,
      metadata: {
        provider: 'github',
        twin_id: this.twin_id,
        operation: 'issues.close',
      },
    };
  }
}

function deterministicNumber(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000000;
  }
  return Math.max(1, hash);
}
