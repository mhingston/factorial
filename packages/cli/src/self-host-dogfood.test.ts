import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host dogfood script', () => {
  beforeAll(async () => {
    const build = await run(['npm', 'run', 'build'], ROOT_DIR);
    expect(build.code).toBe(0);
  });

  it('runs resolved+reopen scenarios and enforces lock decision', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-dogfood-'));
    const result = await run([
      process.execPath,
      join(ROOT_DIR, 'scripts', 'self-host-dogfood.js'),
      '--logs-root',
      logsRoot,
    ], ROOT_DIR);

    expect(result.code).toBe(0);

    const report = JSON.parse(
      await readFile(join(logsRoot, 'report.json'), 'utf-8')
    ) as Record<string, unknown>;

    expect(report.schema_version).toBe('self_host_dogfood_report.v1');

    const scenarios = (report.scenarios as unknown[]) || [];
    expect(scenarios.length).toBe(2);

    const byName = Object.fromEntries(
      scenarios.map(s => [String((s as Record<string, unknown>).name), s])
    ) as Record<string, unknown>;

    const resolved = byName['resolved'] as Record<string, unknown>;
    const reopen = byName['reopen'] as Record<string, unknown>;

    expect(Number(resolved.exit_code)).toBe(0);
    expect(String(resolved.lock)).toBe('resolved');
    expect(String(resolved.manager_final_lock)).toBe('resolved');
    expect(String(resolved.manifest_outcome)).toBe('SUCCESS');

    expect(Number(reopen.exit_code)).not.toBe(0);
    expect(String(reopen.lock)).toBe('reopen');
    expect(String(reopen.manager_final_lock)).toBe('reopen');
    // manifest may still contain FAIL outcome
    expect(String(reopen.manifest_outcome)).toBe('FAIL');

    const summary = report.summary as Record<string, unknown>;
    expect(Boolean(summary.resolved_pass)).toBe(true);
    expect(Boolean(summary.reopen_fail)).toBe(true);
  });
});

async function run(cmd: string[], cwd: string): Promise<CommandResult> {
  return new Promise(resolve => {
    const [exe, ...args] = cmd;
    const child = spawn(exe, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.on('data', c => out.push(String(c)));
    child.stderr.on('data', c => err.push(String(c)));
    child.on('close', code => resolve({ code: code ?? 1, stdout: out.join(''), stderr: err.join('') }));
  });
}

