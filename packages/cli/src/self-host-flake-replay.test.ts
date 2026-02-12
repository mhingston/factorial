import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host flake replay script', () => {
  it('publishes pass report when required suites meet replay threshold', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-flake-pass-'));
    const reportPath = join(tempRoot, 'report.json');
    const suiteConfigPath = join(tempRoot, 'suite-config.json');

    await writeSuiteConfig(suiteConfigPath, [
      {
        id: 'suite-required-pass',
        name: 'Required pass suite',
        required: true,
        command: [process.execPath, '-e', 'process.exit(0)'],
      },
      {
        id: 'suite-optional-fail',
        name: 'Optional fail suite',
        required: false,
        command: [process.execPath, '-e', 'process.exit(1)'],
      },
    ]);

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-flake-replay.js'),
        '--suite-config',
        suiteConfigPath,
        '--report',
        reportPath,
        '--replay-count',
        '2',
        '--min-pass-rate',
        '1',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('self_host_flake_report.v1');

    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.overall_status).toBe('pass');
    expect(summary.required_suite_count).toBe(1);
    expect(summary.required_suites_passing).toBe(1);
    expect(summary.failed_required_suite_ids).toEqual([]);

    const suites = (report.suites as Array<Record<string, unknown>>) ?? [];
    const byId = Object.fromEntries(suites.map(suite => [String(suite.id), suite]));
    expect(String((byId['suite-required-pass'] || {}).status)).toBe('pass');
    expect(String((byId['suite-optional-fail'] || {}).status)).toBe('fail');
  });

  it('fails when required suite pass-rate is below configured threshold', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-flake-fail-'));
    const reportPath = join(tempRoot, 'report.json');
    const suiteConfigPath = join(tempRoot, 'suite-config.json');

    await writeSuiteConfig(suiteConfigPath, [
      {
        id: 'suite-required-fail',
        name: 'Required fail suite',
        required: true,
        command: [process.execPath, '-e', 'process.exit(1)'],
      },
    ]);

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-flake-replay.js'),
        '--suite-config',
        suiteConfigPath,
        '--report',
        reportPath,
        '--replay-count',
        '3',
        '--min-pass-rate',
        '0.5',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.overall_status).toBe('fail');
    expect(summary.failed_required_suite_ids).toEqual(['suite-required-fail']);

    const suites = (report.suites as Array<Record<string, unknown>>) ?? [];
    const failedSuite = suites.find(suite => suite.id === 'suite-required-fail') ?? {};
    const threshold = (failedSuite.threshold ?? {}) as Record<string, unknown>;
    expect(String((failedSuite as Record<string, unknown>).status)).toBe('fail');
    expect(threshold.met).toBe(false);
  });
});

async function writeSuiteConfig(path: string, suites: Array<Record<string, unknown>>): Promise<void> {
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schema_version: 'self_host_flake_suite_config.v1',
        suites,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );
}

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
