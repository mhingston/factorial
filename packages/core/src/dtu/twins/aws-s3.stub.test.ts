import { describe, expect, it } from 'vitest';
import type { TwinInvocationRequest } from '../contracts.js';
import { AwsS3TwinStub } from './aws-s3.stub.js';

describe('AwsS3TwinStub', () => {
  const twin = new AwsS3TwinStub();
  const baseTiming = { requested_at_ms: 1700000000000, timeout_ms: 1000 };

  it('creates a bucket', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'aws.s3',
      operation: 'buckets.create',
      scenario_id: 'scenario-1',
      seed: 'seed-1',
      input: {
        bucket: 'my-bucket',
        region: 'us-east-1',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.bucket).toBe('my-bucket');
    expect(result.output.region).toBe('us-east-1');
  });

  it('stores an object', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'aws.s3',
      operation: 'objects.put',
      scenario_id: 'scenario-2',
      seed: 'seed-2',
      input: {
        bucket: 'my-bucket',
        key: 'path/file.txt',
        content: 'hello',
        actor: 'tester',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('success');
    expect(result.output.key).toBe('path/file.txt');
    expect(result.output.etag).toBeDefined();
  });

  it('simulates bucket not found', async () => {
    const request: TwinInvocationRequest = {
      twin_id: 'aws.s3',
      operation: 'objects.put',
      scenario_id: 'scenario-3',
      seed: 'seed-3',
      input: {
        bucket: 'missing',
        key: 'file.txt',
        content: 'data',
        actor: 'tester',
        simulate: 'bucket_not_found',
      },
      timing: baseTiming,
      metadata: {},
    };

    const result = await twin.invoke(request);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('twin_not_found');
  });
});
