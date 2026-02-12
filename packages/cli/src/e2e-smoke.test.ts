import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  CLI_ENTRY,
  ROOT_DIR,
  createSuiteIsolation,
  ensureDeterministicCliBuild,
  runCommand,
  type SuiteIsolation,
} from './test-harness';

const FIXTURE_DOT = join(ROOT_DIR, 'tests', 'fixtures', 'e2e', 'cli_smoke.dot');
const ENV_FILE = join(ROOT_DIR, 'tests', 'fixtures', 'e2e', '.env.smoke');
const DTU_SCENARIOS_DIR = join(ROOT_DIR, 'tests', 'fixtures', 'dtu', 'scenarios');

describe('CLI e2e smoke tests', () => {
  let logsRoot = '';
  let suiteIsolation: SuiteIsolation;

  beforeAll(async () => {
    await ensureDeterministicCliBuild();
    suiteIsolation = await createSuiteIsolation('cli-e2e-smoke');
    logsRoot = await suiteIsolation.createLogsRoot('run');
  });

  it('validate command succeeds for smoke fixture', async () => {
    const result = await runCommand(
      [process.execPath, CLI_ENTRY, 'validate', '--graph', FIXTURE_DOT, '--env-file', ENV_FILE],
      ROOT_DIR
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Graph is valid');
  });

  it('validate command fails when output contract is required without schema', async () => {
    const tempDir = await suiteIsolation.createTempDir('contract-lint');
    const graphPath = join(tempDir, 'contract_required.dot');
    await writeFile(
      graphPath,
      [
        'digraph ContractRequired {',
        '  start [shape="Mdiamond", label="Start"];',
        '  work [shape="box", type="codergen", llm_provider="openai", llm_model="gpt-test", output_contract_required="true", prompt="Generate"];',
        '  exit [shape="Msquare", label="Exit"];',
        '  start -> work;',
        '  work -> exit;',
        '}',
        '',
      ].join('\n')
    );

    const result = await runCommand(
      [process.execPath, CLI_ENTRY, 'validate', '--graph', graphPath],
      ROOT_DIR
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('OUTPUT_SCHEMA_REQUIRED');
  });

  it('run command succeeds and writes codergen artifacts', async () => {
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'run',
        '--graph',
        FIXTURE_DOT,
        '--logs-root',
        logsRoot,
        '--env-file',
        ENV_FILE,
        '--llm-backend',
        'cli',
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const output = JSON.parse(
      await readFile(join(logsRoot, 'work', 'output.json'), 'utf-8')
    ) as Record<string, unknown>;
    const stdout = await readFile(join(logsRoot, 'work', 'stdout.log'), 'utf-8');
    const manifest = JSON.parse(
      await readFile(join(logsRoot, 'run_manifest.json'), 'utf-8')
    ) as Record<string, unknown>;

    expect(output.status).toBe('success');
    expect(output.output).toBe('smoke-output');
    expect(stdout).toBe('smoke-output');
    expect(manifest.schema_version).toBe('run_manifest.v1');
    expect((manifest.outcome as Record<string, unknown>).status).toBe('SUCCESS');
    expect(Array.isArray((manifest.model_provenance as unknown[]))).toBe(true);
    const provenance = ((manifest.model_provenance as unknown[])[0] ?? {}) as Record<string, unknown>;
    expect(provenance.adapter).toBe('subprocess-cli');
    expect(provenance.backend).toBe('cli');
    expect(provenance.operation).toBe('cli');
    expect(provenance.output_mode).toBe('text');
    const usage = (provenance.usage ?? {}) as Record<string, unknown>;
    expect(usage.input_tokens).toBeNull();
    expect(usage.output_tokens).toBeNull();
    expect(usage.total_tokens).toBeNull();
    expect(usage.cost_usd).toBeNull();
    const tooling = (provenance.tooling ?? {}) as Record<string, unknown>;
    expect((tooling.cli_invocation_path as string) || '').toContain('cli_invocation.json');
    expect((tooling.stdout_path as string) || '').toContain('stdout.log');
    expect((tooling.stderr_path as string) || '').toContain('stderr.log');
    expect((tooling.stream_transcript_path as string) || '').toContain('stream_transcript.json');
    expect((tooling.stream_transcript_ndjson_path as string) || '').toContain(
      'stream_transcript.ndjson'
    );
  });

  it('resume command succeeds from latest checkpoint', async () => {
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'resume',
        '--graph',
        FIXTURE_DOT,
        '--logs-root',
        logsRoot,
        '--env-file',
        ENV_FILE,
        '--llm-backend',
        'cli',
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);
  });

  it('replay command succeeds from run manifest with fixed config', async () => {
    const replayLogsRoot = await suiteIsolation.createLogsRoot('replay');
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'replay',
        '--manifest',
        join(logsRoot, 'run_manifest.json'),
        '--logs-root',
        replayLogsRoot,
        '--env-file',
        ENV_FILE,
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const output = JSON.parse(
      await readFile(join(replayLogsRoot, 'work', 'output.json'), 'utf-8')
    ) as Record<string, unknown>;
    const manifest = JSON.parse(
      await readFile(join(replayLogsRoot, 'run_manifest.json'), 'utf-8')
    ) as Record<string, unknown>;

    expect(output.status).toBe('success');
    expect(output.output).toBe('smoke-output');
    expect((manifest.source as Record<string, unknown>).manifest_path).toContain('run_manifest.json');
    expect((manifest.outcome as Record<string, unknown>).status).toBe('SUCCESS');
  });

  it('replay command supports checkpoint resume with manifest-fixed config', async () => {
    const replayLogsRoot = await suiteIsolation.createLogsRoot('replay-checkpoint');
    const sourceCheckpoint = join(logsRoot, 'checkpoint.json');
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'replay',
        '--manifest',
        join(logsRoot, 'run_manifest.json'),
        '--checkpoint',
        sourceCheckpoint,
        '--logs-root',
        replayLogsRoot,
        '--env-file',
        ENV_FILE,
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const manifest = JSON.parse(
      await readFile(join(replayLogsRoot, 'run_manifest.json'), 'utf-8')
    ) as Record<string, unknown>;
    expect((manifest.command as string)).toBe('replay');
    expect((manifest.source as Record<string, unknown>).checkpoint_path).toBe(sourceCheckpoint);
    expect((manifest.outcome as Record<string, unknown>).status).toBe('SUCCESS');
  });

  it('manifest command emits replay/provenance summary and comparison JSON', async () => {
    const replayLogsRoot = await suiteIsolation.createLogsRoot('replay-manifest');
    const replayResult = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'replay',
        '--manifest',
        join(logsRoot, 'run_manifest.json'),
        '--logs-root',
        replayLogsRoot,
        '--env-file',
        ENV_FILE,
      ],
      ROOT_DIR
    );
    expect(replayResult.code).toBe(0);

    const inspectResult = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'manifest',
        '--manifest',
        join(replayLogsRoot, 'run_manifest.json'),
        '--compare',
        join(logsRoot, 'run_manifest.json'),
        '--json',
      ],
      ROOT_DIR
    );
    expect(inspectResult.code).toBe(0);

    const payload = JSON.parse(inspectResult.stdout) as Record<string, unknown>;
    expect(payload.schema_version).toBe('manifest_inspect.v1');

    const summary = payload.summary as Record<string, unknown>;
    expect(summary.command).toBe('replay');
    const outcome = (summary.outcome ?? {}) as Record<string, unknown>;
    expect(outcome.status).toBe('SUCCESS');

    const comparison = payload.comparison as Record<string, unknown>;
    expect(comparison.equal).toBe(true);
    expect(Array.isArray(comparison.diffs)).toBe(true);
    expect((comparison.diffs as unknown[]).length).toBe(0);
  });

  it('confidence-tune command emits deterministic threshold and route recommendations', async () => {
    const logsRootA = await suiteIsolation.createLogsRoot('confidence-tune-a');
    const logsRootB = await suiteIsolation.createLogsRoot('confidence-tune-b');

    await writeConfidenceResultArtifact(logsRootA, 'run-001', {
      node_id: 'route',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.2,
      escalation_threshold: 0.8,
      decision: 'escalate',
      escalation_target: 'human_primary',
      timestamp: '2026-02-11T00:00:00.000Z',
    });
    await writeConfidenceResultArtifact(logsRootA, 'run-002', {
      node_id: 'route',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.35,
      escalation_threshold: 0.8,
      decision: 'escalate',
      escalation_target: 'human_primary',
      timestamp: '2026-02-11T00:01:00.000Z',
    });
    await writeConfidenceResultArtifact(logsRootA, 'run-003', {
      node_id: 'route',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.62,
      escalation_threshold: 0.8,
      decision: 'autonomous',
      escalation_target: 'human_secondary',
      timestamp: '2026-02-11T00:02:00.000Z',
    });
    await writeConfidenceResultArtifact(logsRootB, 'run-004', {
      node_id: 'route',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.83,
      escalation_threshold: 0.75,
      decision: 'autonomous',
      escalation_target: 'human_secondary',
      timestamp: '2026-02-11T00:03:00.000Z',
    });
    await writeConfidenceResultArtifact(logsRootB, 'run-005', {
      node_id: 'route',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.9,
      escalation_threshold: 0.75,
      decision: 'autonomous',
      escalation_target: 'human_secondary',
      timestamp: '2026-02-11T00:04:00.000Z',
    });
    await writeConfidenceResultArtifact(logsRootB, 'run-006', {
      node_id: 'route-small',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.45,
      escalation_threshold: 0.6,
      decision: 'escalate',
      escalation_target: 'human_fallback',
      timestamp: '2026-02-11T00:05:00.000Z',
    });
    await writeConfidenceResultArtifact(logsRootB, 'run-007', {
      node_id: 'route-small',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.73,
      escalation_threshold: 0.6,
      decision: 'autonomous',
      escalation_target: 'human_fallback',
      timestamp: '2026-02-11T00:06:00.000Z',
    });

    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'confidence-tune',
        '--logs-root',
        logsRootA,
        logsRootB,
        '--target-escalation-rate',
        '0.4',
        '--min-samples',
        '3',
        '--json',
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload.schema_version).toBe('confidence_tuning_report.v1');
    expect(payload.artifacts_scanned).toBe(7);
    expect(payload.artifacts_loaded).toBe(7);
    expect(payload.artifacts_invalid).toBe(0);

    const nodes = payload.nodes as Array<Record<string, unknown>>;
    expect(nodes.length).toBe(2);

    const route = nodes.find(node => node.node_id === 'route') as Record<string, unknown>;
    expect(route.sample_count).toBe(5);
    expect(route.recommendation_status).toBe('ready');
    expect(route.recommended_threshold).toBe(0.512);
    expect(route.recommended_escalation_target).toBe('human_primary');

    const routeCounts = route.decision_counts as Record<string, unknown>;
    expect(routeCounts.escalate).toBe(2);
    expect(routeCounts.autonomous).toBe(3);

    const routeSmall = nodes.find(node => node.node_id === 'route-small') as Record<string, unknown>;
    expect(routeSmall.sample_count).toBe(2);
    expect(routeSmall.recommendation_status).toBe('insufficient_samples');
    expect(routeSmall.recommended_escalation_target).toBe('human_fallback');
  });

  it('compound-weekly command emits standardized weekly metrics report and JSON payload', async () => {
    const outputPath = join(await suiteIsolation.createTempDir('compound-weekly'), 'report.md');
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'compound-weekly',
        '--start',
        '1990-01-01',
        '--end',
        '1990-01-07',
        '--output',
        outputPath,
        '--json',
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload.schema_version).toBe('compound_weekly_metrics.v1');
    expect(payload.output_path).toBe(resolve(outputPath));

    const week = payload.week as Record<string, unknown>;
    expect(week.start).toBe('1990-01-01');
    expect(week.end).toBe('1990-01-07');

    const metrics = payload.metrics as Record<string, unknown>;
    expect(metrics.solutions_created_weekly).toBe(0);
    expect(metrics.context_updates_weekly).toBe(0);
    expect(metrics.review_artifacts_counted).toBe(0);
    expect(metrics.known_issue_recurrence_rate).toBe('N/A');
    expect(metrics.reopen_rate).toBe('N/A');

    const markdown = await readFile(outputPath, 'utf-8');
    expect(markdown).toContain('Week of 1990-01-01 to 1990-01-07');
    expect(markdown).toContain('review_artifacts_counted: 0');
  });

  it('dtu-run command emits satisfaction report for scenario fixtures', async () => {
    const reportPath = join(await suiteIsolation.createTempDir('dtu-report'), 'report.json');
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'dtu-run',
        '--fixtures',
        DTU_SCENARIOS_DIR,
        '--report',
        reportPath,
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DTU scenarios:');

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const totals = report.totals as Record<string, unknown>;
    expect(report.schema_version).toBe('dtu_satisfaction_report.v1');
    expect(totals.unsatisfied).toBe(0);
    expect(report.holdout_rate).toBe(1);
  });
});

async function writeConfidenceResultArtifact(
  logsRoot: string,
  runId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const artifactPath = join(logsRoot, runId, String(payload.node_id), 'confidence_result.json');
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
}
