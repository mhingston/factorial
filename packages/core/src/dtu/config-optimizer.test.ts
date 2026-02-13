import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { optimizeConfiguration } from './config-optimizer.js';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

async function writeRunManifest(
  root: string,
  name: string,
  status: string,
  totalTokens: number,
  maxRestarts: number
): Promise<void> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'run_manifest.json'),
    JSON.stringify(
      {
        outcome: { status },
        run_config: { max_restarts: maxRestarts },
        model_provenance: [
          {
            usage: { total_tokens: totalTokens },
          },
        ],
      },
      null,
      2
    )
  );
}

async function writeConfidenceResult(
  root: string,
  name: string,
  observed: number,
  threshold: number,
  decision: 'autonomous' | 'escalate'
): Promise<void> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'confidence_result.json'),
    JSON.stringify(
      {
        node_id: 'confidence',
        confidence_signal_path: 'confidence.score',
        observed_confidence: observed,
        escalation_threshold: threshold,
        decision,
      },
      null,
      2
    )
  );
}

describe('config-optimizer', () => {
  it('improves projected success rate within drift limits', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-optimize-'));
    await writeRunManifest(logsRoot, 'run-1', 'SUCCESS', 100, 10);
    await writeRunManifest(logsRoot, 'run-2', 'SUCCESS', 120, 10);
    await writeRunManifest(logsRoot, 'run-3', 'FAIL', 135, 10);
    await writeConfidenceResult(logsRoot, 'confidence-1', 0.6, 0.8, 'escalate');
    await writeConfidenceResult(logsRoot, 'confidence-2', 0.7, 0.8, 'escalate');
    await writeConfidenceResult(logsRoot, 'confidence-3', 0.9, 0.8, 'autonomous');

    const report = await optimizeConfiguration({
      logs_root: logsRoot,
      drift_limit: 0.1,
      target_success_rate: 0.9,
      target_autonomy_rate: 0.8,
    });

    expect(report.summary.optimization_status).toBe('pass');
    expect(report.summary.drift_violations).toBe(0);
    expect(report.summary.success_rate_after).toBeGreaterThanOrEqual(
      report.summary.success_rate_before
    );
    const confidenceChange = report.changes.find(change => change.key === 'confidence_threshold');
    expect(confidenceChange?.within_drift).toBe(true);
  });

  it('reports insufficient data when logs are empty', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-optimize-empty-'));
    const report = await optimizeConfiguration({ logs_root: logsRoot });
    expect(report.summary.optimization_status).toBe('insufficient_data');
    expect(report.summary.total_runs).toBe(0);
  });
});
