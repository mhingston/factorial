import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

describe('Non-compliant test with manual setup', () => {
  let tmpDir: string;

  beforeAll(async () => {
    // GP-001 violation: Manual temp directory creation
    tmpDir = await mkdtemp(join(tmpdir(), 'test-'));

    // GP-001 violation: Manual build invocation
    await execa('npm', ['run', 'build']);
  });

  it('should do something', () => {
    expect(tmpDir).toBeDefined();
  });
});
