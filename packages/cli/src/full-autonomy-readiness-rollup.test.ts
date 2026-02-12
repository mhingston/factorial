import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureDeterministicCliBuild } from './test-harness';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Full autonomy readiness rollup script', () => {
  beforeAll(async () => {
    await ensureDeterministicCliBuild();
  });
  it('publishes a readiness report and fails when evidence is missing', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'fa-readiness-rollup-'));
    const reportPath = join(tempRoot, 'readiness.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'full-autonomy-readiness-rollup.js'),
        '--report',
        reportPath,
      ],
      ROOT_DIR,
      {
        FULL_AUTONOMY_REPORT_ROOT: tempRoot,
      }
    );

    expect([0, 1]).toContain(result.code);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('full_autonomy_readiness_report.v1');
    expect((report.summary as Record<string, unknown>).overall_status).toBe('fail');
  });

  it('passes when all FA evidence artifacts are present with pass statuses', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'fa-readiness-rollup-pass-'));
    const reportPath = join(tempRoot, 'readiness.json');
    const reportsDir = join(tempRoot, 'docs', 'metrics', 'reports');

    await mkdirp(reportsDir);

    await writeJson(join(reportsDir, 'external-system-operations-latest.json'), {
      schema_version: 'external_system_operations_report.v1',
      generated_at: new Date().toISOString(),
      summary: {
        total_operations: 1,
        successful: 1,
        failed: 0,
        degraded: 0,
        circuit_open: 0,
        rollbacks_performed: 0,
      },
      systems: [],
      audit_trail_sample: [],
      fa_001_status: 'pass',
    });

    await writeJson(join(reportsDir, 'circuit-breaker-tuning-latest.json'), {
      schema_version: 'circuit_breaker_tuning_report.v1',
      generated_at: new Date().toISOString(),
      fa_002_status: 'pass',
      summary: { total_tests: 1, passed: 1, failed: 0 },
      tests: [],
      requirements_validated: {},
      tuning_capabilities: {},
    });

    await writeJson(join(reportsDir, 'self-modification-latest.json'), {
      schema_version: 'self_modification_report.v1',
      generated_at: new Date().toISOString(),
      summary: { total_modifications: 1, applied: 1, rolled_back: 0, lint_errors: 0 },
      modifications: [],
      validation: { passed: true, checks: [] },
      fa_003_status: 'pass',
    });

    await writeJson(join(reportsDir, 'config-optimization-latest.json'), {
      schema_version: 'config_optimization_report.v1',
      generated_at: new Date().toISOString(),
      summary: {
        total_runs: 1,
        success_rate_before: 1,
        success_rate_after: 1,
        improved_success_rate: true,
        drift_violations: 0,
        optimization_status: 'pass',
      },
      baseline: {},
      optimized: {},
      checks: [],
      changes: [],
      evidence: { run_manifests: [], confidence_results: [] },
      validation: { passed: true, checks: [] },
      fa_004_status: 'pass',
    });

    await writeJson(join(reportsDir, 'codegen-validation-latest.json'), {
      schema_version: 'codegen_validation_report.v1',
      generated_at: new Date().toISOString(),
      summary: { total_handlers: 1, passed: 1, failed: 0 },
      handlers: [],
      validation: { passed: true, checks: [] },
      fa_005_status: 'pass',
    });

    await writeJson(join(reportsDir, 'distributed-consensus-latest.json'), {
      schema_version: 'distributed_consensus_report.v1',
      generated_at: new Date().toISOString(),
      summary: {
        total_scenarios: 1,
        leader_election_success: 1,
        split_brain_detected: 0,
        failover_successful: 1,
        state_consistency_achieved: 1,
        no_quorum_failures: 0,
      },
      scenarios: [],
      test_coverage: {
        leader_election_3plus: true,
        network_partition_split_brain: true,
        quorum_requirements: true,
        leader_failover: true,
        state_consistency: true,
      },
      validation: { passed: true, checks: [] },
      fa_006_status: 'pass',
    });

    await writeJson(join(reportsDir, 'cross-repo-coordination-latest.json'), {
      schema_version: 'cross_repo_coordination_report.v1',
      generated_at: new Date().toISOString(),
      summary: {
        total_scenarios: 1,
        passed: 1,
        failed: 0,
        cycle_detection_passed: true,
        lock_propagation_passed: true,
        transitive_chain_passed: true,
        network_failure_handled: true,
        rollback_coordination_passed: true,
      },
      scenarios: [],
      validation: { passed: true, checks: [] },
      fa_007_status: 'pass',
    });

    await writeJson(join(reportsDir, 'full-autonomy-telemetry-latest.json'), {
      schema_version: 'full_autonomy_telemetry_report.v1',
      generated_at: new Date().toISOString(),
      source: {
        path: 'docs/metrics/reports/full-autonomy-telemetry-source-latest.json',
        schema_version: 'full_autonomy_telemetry_source.v1',
        generated_at: new Date().toISOString(),
        window: { start: new Date().toISOString(), end: new Date().toISOString() },
        maintenance_window_days: 30,
        age_days: 0,
      },
      summary: {
        total_runs: 1,
        zero_escalation_rate: 1,
        ood_rate: 0,
        categories_covered: 1,
        window_days: 30,
        maintenance_window_days: 30,
      },
      checks: [],
      validation: { passed: true, checks: [] },
      fa_008_status: 'pass',
    });

    await writeJson(join(reportsDir, 'self-healing-latest.json'), {
      schema_version: 'self_healing_report.v1',
      generated_at: new Date().toISOString(),
      summary: {
        total_scenarios: 1,
        total_attempts: 1,
        successful_attempts: 1,
        failed_attempts: 0,
        classifications: {},
        actions: {},
      },
      scenarios: [],
      validation: { passed: true, checks: [] },
      fa_009_status: 'pass',
    });

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'full-autonomy-readiness-rollup.js'),
        '--report',
        reportPath,
      ],
      tempRoot,
      {
        FULL_AUTONOMY_REPORT_ROOT: tempRoot,
      }
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect((report.summary as Record<string, unknown>).overall_status).toBe('pass');
  });
});

async function mkdirp(path: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path, { recursive: true });
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

async function run(cmd: string[], cwd: string, envOverride: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise(resolve => {
    const [exe, ...args] = cmd;
    const child = spawn(exe, args, {
      cwd,
      env: { ...process.env, ...envOverride },
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
