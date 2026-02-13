import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host codegen validation script', () => {
  it('validates codegen artifacts against golden fixtures', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-codegen-val-'));
    const reportPath = join(tempRoot, 'codegen-validation-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-codegen-validation.js'),
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('codegen_validation_report.v1');

    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.total_handlers).toBeGreaterThan(0);
    expect(summary.passed).toBeGreaterThanOrEqual(0);
    expect(summary.failed).toBeGreaterThanOrEqual(0);

    const handlers = (report.handlers as Array<Record<string, unknown>>) ?? [];
    expect(handlers.length).toBe(summary.total_handlers);

    // Verify each handler has required fields
    for (const handler of handlers) {
      expect(handler.node_type).toBeDefined();
      expect(handler.handler_name).toBeDefined();
      expect(handler.status).toMatch(/^(pass|fail)$/);
      expect(handler.golden_match).toBeDefined();
    }

    // Verify validation section
    const validation = (report.validation ?? {}) as Record<string, unknown>;
    expect(validation.passed).toBeDefined();
    expect(validation.checks).toBeDefined();

    // Verify FA-005 status
    expect(report.fa_005_status).toMatch(/^(pass|fail)$/);
  });

  it('fails with --require-pass when validation fails', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-codegen-req-'));
    const reportPath = join(tempRoot, 'codegen-validation-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-codegen-validation.js'),
        '--report',
        reportPath,
        '--require-pass',
      ],
      ROOT_DIR,
    );

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    if (report.fa_005_status === 'pass') {
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
