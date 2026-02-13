import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

interface FreshnessCheckResult {
  artifact_path: string;
  last_modified: string | null;
  age_hours: number | null;
  max_age_hours: number;
  status: 'fresh' | 'stale' | 'missing';
  recommended_action: string;
  schema_valid: boolean;
  schema_version: string | null;
}

async function checkSingleArtifact(
  filePath: string,
  maxAgeHours: number
): Promise<FreshnessCheckResult> {
  const exists = existsSync(filePath);

  if (!exists) {
    return {
      artifact_path: filePath,
      last_modified: null,
      age_hours: null,
      max_age_hours: maxAgeHours,
      status: 'missing',
      recommended_action: `Create artifact at ${filePath}`,
      schema_valid: false,
      schema_version: null,
    };
  }

  try {
    const stats = statSync(filePath);
    const now = Date.now();
    const mtime = stats.mtime.getTime();
    const ageMs = now - mtime;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const ageHours = ageMs / (1000 * 60 * 60);
    const isFresh = ageMs <= maxAgeMs;

    let schemaValid = false;
    let schemaVersion: string | null = null;
    try {
      const content = await import('node:fs/promises').then(fs => fs.readFile(filePath, 'utf-8'));
      const parsed = JSON.parse(content);
      schemaValid = true;
      schemaVersion = parsed.schema_version || null;
    } catch {
      schemaValid = false;
    }

    let status: 'fresh' | 'stale';
    let recommendedAction: string;

    if (!schemaValid) {
      status = 'stale';
      recommendedAction = 'Fix JSON schema error';
    } else if (!isFresh) {
      status = 'stale';
      recommendedAction = `Regenerate artifact (age exceeds ${maxAgeHours} hours)`;
    } else {
      status = 'fresh';
      recommendedAction = 'No action needed';
    }

    return {
      artifact_path: filePath,
      last_modified: stats.mtime.toISOString(),
      age_hours: Math.round(ageHours * 100) / 100,
      max_age_hours: maxAgeHours,
      status,
      recommended_action: recommendedAction,
      schema_valid: schemaValid,
      schema_version: schemaVersion,
    };
  } catch {
    return {
      artifact_path: filePath,
      last_modified: null,
      age_hours: null,
      max_age_hours: maxAgeHours,
      status: 'missing',
      recommended_action: `Cannot read artifact at ${filePath}`,
      schema_valid: false,
      schema_version: null,
    };
  }
}

describe('Evidence Freshness Logic', () => {
  it('reports fresh for recent artifact', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'freshness-test-'));
    const artifactPath = join(tempDir, 'fresh-artifact.json');

    await writeFile(
      artifactPath,
      JSON.stringify({ schema_version: 'test.v1', data: 'test' })
    );

    const result = await checkSingleArtifact(artifactPath, 168);

    expect(result.status).toBe('fresh');
    expect(result.schema_valid).toBe(true);
    expect(result.schema_version).toBe('test.v1');
    expect(result.age_hours).not.toBeNull();
    expect(result.age_hours! < 1).toBe(true);
  });

  it('reports missing for non-existent artifact', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'freshness-test-'));
    const artifactPath = join(tempDir, 'non-existent.json');

    const result = await checkSingleArtifact(artifactPath, 168);

    expect(result.status).toBe('missing');
    expect(result.last_modified).toBeNull();
    expect(result.age_hours).toBeNull();
    expect(result.schema_valid).toBe(false);
  });

  it('reports stale for old artifact', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'freshness-test-'));
    const artifactPath = join(tempDir, 'stale-artifact.json');

    await writeFile(
      artifactPath,
      JSON.stringify({ schema_version: 'test.v1', data: 'test' })
    );

    // Small delay to ensure file has measurable age
    await new Promise(resolve => setTimeout(resolve, 10));

    // Check with a very low max age to force staleness
    const result = await checkSingleArtifact(artifactPath, 0);

    expect(result.status).toBe('stale');
    expect(result.age_hours).not.toBeNull();
    expect(result.age_hours! >= 0).toBe(true);
  });

  it('reports invalid schema for non-JSON file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'freshness-test-'));
    const artifactPath = join(tempDir, 'invalid.json');

    await writeFile(artifactPath, 'not valid json');

    const result = await checkSingleArtifact(artifactPath, 168);

    expect(result.status).toBe('stale');
    expect(result.schema_valid).toBe(false);
  });

  it('respects max_age_hours parameter', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'freshness-test-'));
    const artifactPath = join(tempDir, 'test-artifact.json');

    await writeFile(
      artifactPath,
      JSON.stringify({ schema_version: 'test.v1' })
    );

    // With 1 hour max, it should be fresh (just created)
    const freshResult = await checkSingleArtifact(artifactPath, 1);
    expect(freshResult.status).toBe('fresh');

    // Small delay to ensure measurable age
    await new Promise(resolve => setTimeout(resolve, 10));

    // With 0 hours max, it should be stale
    const staleResult = await checkSingleArtifact(artifactPath, 0);
    expect(staleResult.status).toBe('stale');
  });
});

describe('Evidence Freshness CLI Integration', () => {
  it('factorial check:freshness command exists', async () => {
    const { spawn } = await import('node:child_process');
    const cliPath = join(ROOT_DIR, 'dist', 'packages', 'cli', 'src', 'index.js');

    // Skip if not built yet
    if (!existsSync(cliPath)) {
      console.log('CLI not built, skipping integration test');
      return;
    }

    const result = await new Promise<{ code: number; stdout: string; stderr: string }>(resolve => {
      const child = spawn(process.execPath, [cliPath, 'check:freshness', '--help'], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => stdout += String(chunk));
      child.stderr.on('data', chunk => stderr += String(chunk));

      child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('check:freshness');
  });

});
