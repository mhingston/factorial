import { beforeAll, describe, expect, it } from 'vitest';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ROOT_DIR,
  createSuiteIsolation,
  ensureDeterministicCliBuild,
  runCommand,
  type SuiteIsolation,
} from './test-harness';

describe('Self-host maturity script', () => {
  let suiteIsolation: SuiteIsolation;

  beforeAll(async () => {
    await ensureDeterministicCliBuild();
    suiteIsolation = await createSuiteIsolation('self-host-maturity');
  });

  it('emits deterministic maturity report and enforces deterministic-local level', async () => {
    const logsRoot = await suiteIsolation.createLogsRoot('maturity');
    const reportPath = join(logsRoot, 'report.json');
    const markdownPath = join(logsRoot, 'report.md');
    const providerBackedReportPath = join(logsRoot, 'provider-backed.json');
    const autonomousReportPath = join(logsRoot, 'autonomous-missing.json');
    const agentAuditReportPath = join(logsRoot, 'agent-audit-missing.json');

    await writeFile(
      providerBackedReportPath,
      `${JSON.stringify(
        {
          schema_version: 'self_host_provider_backed_report.v1',
          summary: {
            pb001_status: 'pass',
            pb002_status: 'pass',
            provider_parity_contract_tests_pass: true,
            providers: {
              openai: 'pass',
              anthropic: 'pass',
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = await runCommand(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-maturity.js'),
        '--logs-root',
        logsRoot,
        '--report',
        reportPath,
        '--markdown',
        markdownPath,
        '--provider-backed-report',
        providerBackedReportPath,
        '--autonomous-report',
        autonomousReportPath,
        '--agent-audit-report',
        agentAuditReportPath,
        '--require-level',
        'deterministic-local',
      ],
      ROOT_DIR,
      {
        SELF_HOST_MATURITY_SKIP_BUILD: '1',
        DOGFOOD_SKIP_BUILD: '1',
      },
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;

    expect(report.schema_version).toBe('self_host_maturity_report.v1');
    expect(report.required_level).toBe('deterministic-local');
    expect(report.required_level_met).toBe(true);
    expect(report.declared_current_level).toBe('provider-backed');
    expect(report.assessed_current_level).toBe('provider-backed');
    expect(report.next_level).toBe('autonomous');

    const gates = (report.gates as Array<Record<string, unknown>>) ?? [];
    const gateById = Object.fromEntries(gates.map(gate => [String(gate.id), gate]));

    expect(String((gateById['DL-001'] || {}).status)).toBe('pass');
    expect(String((gateById['DL-002'] || {}).status)).toBe('pass');
    expect(String((gateById['DL-003'] || {}).status)).toBe('pass');
    expect(String((gateById['PB-001'] || {}).status)).toBe('pass');
    expect(String((gateById['PB-002'] || {}).status)).toBe('pass');

    await access(markdownPath);
    const markdown = await readFile(markdownPath, 'utf-8');
    expect(markdown).toContain('# Self-host Maturity Report');
    expect(markdown).toContain('deterministic-local');
    expect(markdown).toContain('provider-backed');
    expect(markdown).toContain('autonomous');
  }, 30_000);

  it('validates AU-001 and AU-002 from strict published report schemas', async () => {
    const logsRoot = await suiteIsolation.createLogsRoot('maturity-au');
    const reportPath = join(logsRoot, 'report.json');
    const providerBackedReportPath = join(logsRoot, 'provider-backed.json');
    const autonomousReportPath = join(logsRoot, 'autonomous.json');
    const agentAuditReportPath = join(logsRoot, 'agent-audit.json');

    await writeFile(
      providerBackedReportPath,
      `${JSON.stringify(
        {
          schema_version: 'self_host_provider_backed_report.v1',
          summary: {
            pb001_status: 'pass',
            pb002_status: 'pass',
            provider_parity_contract_tests_pass: true,
            providers: {
              openai: 'pass',
              anthropic: 'pass',
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    await writeFile(
      autonomousReportPath,
      `${JSON.stringify(
        {
          schema_version: 'self_host_autonomous_report.v1',
          summary: {
            au001_status: 'pass',
            stability_pass: true,
            guardrails_pass: true,
            human_free_pass: true,
            overall_status: 'pass',
            failed_check_ids: [],
          },
          checks: [{ id: 'AU-STAB-001', status: 'pass' }],
        },
        null,
        2,
      )}\n`,
    );

    await writeFile(
      agentAuditReportPath,
      `${JSON.stringify(
        {
          schema_version: 'self_host_agent_audit_report.v1',
          summary: {
            overall_status: 'pass',
            required_checks_failed: 0,
          },
          checks: [{ id: 'AUD-001', required: true, status: 'pass' }],
        },
        null,
        2,
      )}\n`,
    );

    const result = await runCommand(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-maturity.js'),
        '--logs-root',
        logsRoot,
        '--report',
        reportPath,
        '--provider-backed-report',
        providerBackedReportPath,
        '--autonomous-report',
        autonomousReportPath,
        '--agent-audit-report',
        agentAuditReportPath,
        '--require-level',
        'provider-backed',
      ],
      ROOT_DIR,
      {
        SELF_HOST_MATURITY_SKIP_BUILD: '1',
        DOGFOOD_SKIP_BUILD: '1',
      },
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const gates = (report.gates as Array<Record<string, unknown>>) ?? [];
    const gateById = Object.fromEntries(gates.map(gate => [String(gate.id), gate]));

    expect(String((gateById['AU-001'] || {}).status)).toBe('pass');
    expect(String((gateById['AU-002'] || {}).status)).toBe('pass');
  }, 30_000);
});
