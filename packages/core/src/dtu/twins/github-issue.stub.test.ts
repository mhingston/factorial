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
        input: {
          repo: 'owner/repo',
          title: 'Test Issue',
          body: 'This is a test issue',
          labels: ['bug', 'help wanted'],
          actor: 'testuser',
        },
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
        input: {
          repo: '', // Invalid: empty string
          title: 'Test',
        },
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
        input: {
          repo: 'owner/repo',
          title: 'Test',
          actor: 'testuser',
          simulate: 'auth_failed',
        },
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
        input: {
          repo: 'owner/repo',
          title: 'Test',
          actor: 'testuser',
          simulate: 'rate_limited',
        },
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
        input: {
          repo: 'owner/nonexistent',
          title: 'Test',
          actor: 'testuser',
          simulate: 'repo_not_found',
        },
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
        input: {
          repo: 'owner/repo',
          issue_number: 42,
          body: 'This is a comment',
          actor: 'testuser',
        },
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
        input: {
          repo: 'owner/repo',
          issue_number: 999,
          body: 'Comment',
          actor: 'testuser',
          simulate: 'issue_not_found',
        },
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
        input: {
          repo: 'owner/repo',
          issue_number: 42,
          actor: 'testuser',
        },
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
        input: {
          repo: 'owner/repo',
          issue_number: 999,
          actor: 'testuser',
          simulate: 'issue_not_found',
        },
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
        input: {},
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
