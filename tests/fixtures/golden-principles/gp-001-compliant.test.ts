import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

describe('Compliant test using shared harness', () => {
  let isolation: Awaited<ReturnType<typeof createSuiteIsolation>>;

  beforeAll(async () => {
    await ensureDeterministicCliBuild();
    isolation = await createSuiteIsolation('compliant-test');
  });

  afterAll(async () => {
    // Cleanup handled by harness
  });

  it('should use shared utilities', async () => {
    const tempDir = await isolation.createTempDir('test-case');
    expect(tempDir).toBeDefined();
  });
});
