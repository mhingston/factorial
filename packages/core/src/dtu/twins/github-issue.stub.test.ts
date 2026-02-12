import { describe, expect, it } from 'vitest';
import type { TwinInvocationRequest } from '../contracts.js';
import { GitHubIssueTwinStub } from './github-issue.stub.js';

describe('GitHubIssueTwinStub', () => {
  const twin = new GitHubIssueTwinStub();

  describe('issues.create', () => {
    it('creates an issue successfully', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.create',
        scenario_id: 'scenario-1',
        seed: 'seed-1',
        input: {
          repo: 'owner/repo',
          title: 'Test Issue',
          body: 'This is a test issue',
          labels: ['bug', 'help wanted'],
          actor: 'testuser',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('success');
      expect(result.output).toMatchObject({
        repo: 'owner/repo',
        title: 'Test Issue',
        body: 'This is a test issue',
        labels: ['bug', 'help wanted'],
        state: 'open',
        created_by: 'testuser',
      });
      expect(result.output.issue_number).toBeDefined();
      expect(result.output.url).toContain('github.com/owner/repo/issues/');
      expect(result.latency_ms).toBe(5);
      expect(result.metadata?.provider).toBe('github');
    });

    it('returns error for invalid input', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.create',
        scenario_id: 'scenario-2',
        seed: 'seed-2',
        input: {
          repo: '', // Invalid: empty string
          title: 'Test',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('malformed_request');
      expect(result.error?.class).toBe('spec_mismatch');
    });

    it('simulates auth failure', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.create',
        scenario_id: 'scenario-3',
        seed: 'seed-3',
        input: {
          repo: 'owner/repo',
          title: 'Test',
          actor: 'testuser',
          simulate: 'auth_failed',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('auth_failed');
      expect(result.error?.class).toBe('auth');
      expect(result.error?.retryable).toBe(false);
    });

    it('simulates rate limiting', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.create',
        scenario_id: 'scenario-4',
        seed: 'seed-4',
        input: {
          repo: 'owner/repo',
          title: 'Test',
          actor: 'testuser',
          simulate: 'rate_limited',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('rate_limited');
      expect(result.error?.class).toBe('rate_limit');
      expect(result.error?.retryable).toBe(true);
      expect(result.error?.details?.retry_after_ms).toBe(60000);
    });

    it('simulates repo not found', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.create',
        scenario_id: 'scenario-5',
        seed: 'seed-5',
        input: {
          repo: 'owner/nonexistent',
          title: 'Test',
          actor: 'testuser',
          simulate: 'repo_not_found',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('twin_not_found');
      expect(result.error?.class).toBe('not_found');
    });
  });

  describe('issues.add_comment', () => {
    it('adds a comment successfully', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.add_comment',
        scenario_id: 'scenario-6',
        seed: 'seed-6',
        input: {
          repo: 'owner/repo',
          issue_number: 42,
          body: 'This is a comment',
          actor: 'testuser',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('success');
      expect(result.output).toMatchObject({
        repo: 'owner/repo',
        issue_number: 42,
        body: 'This is a comment',
        created_by: 'testuser',
      });
      expect(result.output.comment_id).toBeDefined();
      expect(result.output.url).toContain('#issuecomment-');
    });

    it('simulates issue not found', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.add_comment',
        scenario_id: 'scenario-7',
        seed: 'seed-7',
        input: {
          repo: 'owner/repo',
          issue_number: 999,
          body: 'Comment',
          actor: 'testuser',
          simulate: 'issue_not_found',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('twin_not_found');
    });
  });

  describe('issues.close', () => {
    it('closes an issue successfully', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.close',
        scenario_id: 'scenario-8',
        seed: 'seed-8',
        input: {
          repo: 'owner/repo',
          issue_number: 42,
          actor: 'testuser',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('success');
      expect(result.output).toMatchObject({
        repo: 'owner/repo',
        issue_number: 42,
        state: 'closed',
        closed_by: 'testuser',
      });
      expect(result.output.closed_at).toBeDefined();
    });

    it('simulates issue not found on close', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.close',
        scenario_id: 'scenario-9',
        seed: 'seed-9',
        input: {
          repo: 'owner/repo',
          issue_number: 999,
          actor: 'testuser',
          simulate: 'issue_not_found',
        },
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('twin_not_found');
    });
  });

  describe('unsupported operations', () => {
    it('returns error for unsupported operation', async () => {
      const request: TwinInvocationRequest = {
        twin_id: 'github.issue',
        operation: 'issues.delete',
        scenario_id: 'scenario-10',
        seed: 'seed-10',
        input: {},
        timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
        metadata: {},
      };

      const result = await twin.invoke(request);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('operation_not_supported');
      expect(result.error?.class).toBe('spec_mismatch');
      expect(result.metadata?.supported_operations).toContain('issues.create');
      expect(result.metadata?.supported_operations).toContain('issues.add_comment');
      expect(result.metadata?.supported_operations).toContain('issues.close');
    });
  });

  describe('twin metadata', () => {
    it('has correct twin_id and version', () => {
      expect(twin.twin_id).toBe('github.issue');
      expect(twin.version).toBe('0.1.0');
    });
  });
});
