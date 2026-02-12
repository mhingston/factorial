import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ROOT_DIR,
  createSuiteIsolation,
  ensureDeterministicCliBuild,
  runCommand,
  type SuiteIsolation,
} from './test-harness';

describe('Self-host dogfood script', () => {
  let suiteIsolation: SuiteIsolation;

  beforeAll(async () => {
    await ensureDeterministicCliBuild();
    suiteIsolation = await createSuiteIsolation('self-host-dogfood');
  });

  it('runs resolved+reopen scenarios and enforces lock decision', async () => {
    const logsRoot = await suiteIsolation.createLogsRoot('dogfood');
    const result = await runCommand(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-dogfood.js'),
        '--logs-root',
        logsRoot,
      ],
      ROOT_DIR,
      {
        DOGFOOD_SKIP_BUILD: '1',
      },
    );

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
