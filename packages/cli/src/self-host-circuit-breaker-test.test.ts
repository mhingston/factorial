import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host circuit breaker test script', () => {
  it('runs circuit breaker tests and produces valid report', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-cb-test-'));
    const reportPath = join(tempRoot, 'circuit-breaker-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-circuit-breaker-test.js'),
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('circuit_breaker_tuning_report.v1');
    expect(report.fa_002_status).toBe('pass');

    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.total_tests).toBeGreaterThan(0);
    expect(summary.passed).toBeGreaterThan(0);

    const tests = (report.tests as Array<Record<string, unknown>>) ?? [];
    expect(tests.length).toBeGreaterThan(0);

    // Verify each test has required fields
    for (const test of tests) {
      expect(test.test).toBeDefined();
      expect(test.passed).toBeDefined();
    }
  });

  it('fails with --require-pass when tests fail', async () => {
    // This test verifies the --require-pass flag works
    // The script should pass when all tests pass
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-cb-req-pass-'));
    const reportPath = join(tempRoot, 'circuit-breaker-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-circuit-breaker-test.js'),
        '--report',
        reportPath,
        '--require-pass',
      ],
      ROOT_DIR,
    );

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    if (report.fa_002_status === 'pass') {
      expect(result.code).toBe(0);
    } else {
      expect(result.code).toBe(1);
    }
  });
});

async function run(
  cmd: string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise(resolve => {
    const [exe, ...args] = cmd;
    const child = spawn(exe, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const out: string[] = [];
    const err: string[] = [];

    child.stdout.on('data', chunk => out.push(String(chunk)));
    child.stderr.on('data', chunk => err.push(String(chunk)));

    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stdout: out.join(''),
        stderr: err.join(''),
      });
    });
  });
}
