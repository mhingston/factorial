import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const FIXTURES_DIR = join(ROOT_DIR, 'tests', 'fixtures', 'docs-freshness');

describe('Docs freshness audit script', () => {
  it('passes for compliant docs fixtures', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-docs-freshness-pass-'));
    const reportPath = join(tempRoot, 'docs-freshness-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'docs-freshness-audit.js'),
        ...commonFixtureArgs(reportPath),
        '--today',
        '2026-02-12',
        '--max-roadmap-age-days',
        '30',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('docs_freshness_report.v1');
    expect(report.summary).toMatchObject({
      overall_status: 'pass',
      failed_check_ids: [],
      roadmap_last_updated: '2026-02-12',
      roadmap_age_days: 0,
      agents_backlog_direction_ids: ['BK-016'],
      roadmap_next_backlog_ids: ['BK-016'],
    });

    const checks = (report.checks as Array<Record<string, unknown>>) ?? [];
    const checkById = Object.fromEntries(checks.map(check => [String(check.id), check]));
    expect(String((checkById['DF-005'] || {}).status)).toBe('pass');
    expect(String((checkById['DF-006'] || {}).status)).toBe('pass');
  });

  it('fails closed when README misses AGENTS core command', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-docs-freshness-command-fail-'));
    const reportPath = join(tempRoot, 'docs-freshness-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'docs-freshness-audit.js'),
        ...commonFixtureArgs(reportPath, { readme: 'README.missing-command.md' }),
        '--today',
        '2026-02-12',
        '--max-roadmap-age-days',
        '30',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.overall_status).toBe('fail');

    const failedCheckIds = Array.isArray(summary.failed_check_ids)
      ? summary.failed_check_ids.map(value => String(value))
      : [];
    expect(failedCheckIds).toContain('DF-002');
  });

  it('fails closed when roadmap freshness SLA is violated', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-docs-freshness-stale-fail-'));
    const reportPath = join(tempRoot, 'docs-freshness-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'docs-freshness-audit.js'),
        ...commonFixtureArgs(reportPath, { roadmap: 'ROADMAP.stale.md' }),
        '--today',
        '2026-02-12',
        '--max-roadmap-age-days',
        '30',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.overall_status).toBe('fail');

    const failedCheckIds = Array.isArray(summary.failed_check_ids)
      ? summary.failed_check_ids.map(value => String(value))
      : [];
    expect(failedCheckIds).toContain('DF-003');
  });

  it('fails closed when markdown size budgets are exceeded', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-docs-freshness-budget-fail-'));
    const reportPath = join(tempRoot, 'docs-freshness-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'docs-freshness-audit.js'),
        ...commonFixtureArgs(reportPath),
        '--today',
        '2026-02-12',
        '--max-roadmap-age-days',
        '30',
        '--max-roadmap-lines',
        '5',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    const failedCheckIds = Array.isArray(summary.failed_check_ids)
      ? summary.failed_check_ids.map(value => String(value))
      : [];
    expect(failedCheckIds).toContain('DF-005');
  });

  it('fails closed when compaction assets are missing', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-docs-freshness-assets-fail-'));
    const reportPath = join(tempRoot, 'docs-freshness-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'docs-freshness-audit.js'),
        ...commonFixtureArgs(reportPath, { handoff: 'HANDOFF.missing.md' }),
        '--today',
        '2026-02-12',
        '--max-roadmap-age-days',
        '30',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    const failedCheckIds = Array.isArray(summary.failed_check_ids)
      ? summary.failed_check_ids.map(value => String(value))
      : [];
    expect(failedCheckIds).toContain('DF-006');
  });
});

function commonFixtureArgs(
  reportPath: string,
  overrides: {
    readme?: string;
    agents?: string;
    roadmap?: string;
    packageJson?: string;
    handoff?: string;
    archiveIndex?: string;
  } = {},
): string[] {
  const readme = overrides.readme ?? 'README.compliant.md';
  const agents = overrides.agents ?? 'AGENTS.compliant.md';
  const roadmap = overrides.roadmap ?? 'ROADMAP.compliant.md';
  const packageJson = overrides.packageJson ?? 'package.compliant.json';
  const handoff = overrides.handoff ?? 'HANDOFF.compliant.md';
  const archiveIndex = overrides.archiveIndex ?? 'ARCHIVE-README.compliant.md';

  return [
    '--readme',
    join(FIXTURES_DIR, readme),
    '--agents',
    join(FIXTURES_DIR, agents),
    '--roadmap',
    join(FIXTURES_DIR, roadmap),
    '--package-json',
    join(FIXTURES_DIR, packageJson),
    '--handoff',
    join(FIXTURES_DIR, handoff),
    '--archive-index',
    join(FIXTURES_DIR, archiveIndex),
    '--report',
    reportPath,
  ];
}

async function run(cmd: string[], cwd: string): Promise<CommandResult> {
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
