import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host external systems script', () => {
  it('runs external systems test and produces valid report', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-ext-sys-'));
    const reportPath = join(tempRoot, 'external-systems-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-external-systems.js'),
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('external_system_operations_report.v1');

    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.total_operations).toBeGreaterThan(0);
    expect(summary.successful).toBeGreaterThanOrEqual(0);
    expect(summary.failed).toBeGreaterThanOrEqual(0);

    const systems = (report.systems as Array<Record<string, unknown>>) ?? [];
    expect(systems.length).toBeGreaterThan(0);

    // Verify each system has required fields
    for (const system of systems) {
      expect(system.system_id).toBeDefined();
      expect(system.total_operations).toBeGreaterThanOrEqual(0);
      expect(system.circuit_breaker_state).toMatch(/^(closed|open|half_open)$/);
    }

    // Verify audit trail sample
    const auditTrail = (report.audit_trail_sample as Array<Record<string, unknown>>) ?? [];
    expect(auditTrail.length).toBeGreaterThanOrEqual(0);
    expect(auditTrail.length).toBeLessThanOrEqual(10);
  });

  it('respects --require-pass flag', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-ext-sys-req-'));
    const reportPath = join(tempRoot, 'external-systems-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-external-systems.js'),
        '--report',
        reportPath,
        '--require-pass',
      ],
      ROOT_DIR,
    );

    // Verify report is written even when validation fails
    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('external_system_operations_report.v1');

    // Exit code reflects validation status
    if (result.code === 0) {
      expect(report.fa_001_status).toBe('pass');
    } else {
      expect(report.fa_001_status).toBe('fail');
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
