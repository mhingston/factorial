import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = dirname(dirname(dirname(__dirname)));

interface ConfidenceResult {
  node_id: string;
  confidence_signal_path: string;
  observed_confidence: number;
  escalation_threshold: number;
  decision: 'autonomous' | 'escalate';
  escalation_target?: string;
}

async function setupTestLogsRoot(): Promise<string> {
  const logsRoot = join(tmpdir(), `confidence-publish-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(logsRoot, { recursive: true });
  return logsRoot;
}

async function writeConfidenceResult(
  logsRoot: string,
  nodeId: string,
  result: ConfidenceResult
): Promise<void> {
  const stageDir = join(logsRoot, nodeId);
  await mkdir(stageDir, { recursive: true });
  await writeFile(
    join(stageDir, 'confidence_result.json'),
    JSON.stringify(result, null, 2)
  );
}

async function runPublishCommand(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [
      join(ROOT_DIR, 'scripts', 'confidence-tune-publish.js'),
      ...args,
    ], {
      cwd: ROOT_DIR,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

describe('confidence-tune-publish', () => {
  let logsRootA: string;
  let logsRootB: string;
  let reportPath: string;

  beforeEach(async () => {
    logsRootA = await setupTestLogsRoot();
    logsRootB = await setupTestLogsRoot();
    reportPath = join(tmpdir(), `confidence-report-${Date.now()}.json`);
  });

  afterEach(async () => {
    await rm(logsRootA, { recursive: true, force: true });
    await rm(logsRootB, { recursive: true, force: true });
    try {
      await rm(reportPath, { force: true });
    } catch {
      // Ignore
    }
  });

  it('publishes deterministic recommendation report with valid confidence artifacts', async () => {
    // Setup confidence results
    await writeConfidenceResult(logsRootA, 'gate1', {
      node_id: 'gate1',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.85,
      escalation_threshold: 0.7,
      decision: 'autonomous',
    });
    await writeConfidenceResult(logsRootA, 'gate2', {
      node_id: 'gate2',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.45,
      escalation_threshold: 0.7,
      decision: 'escalate',
      escalation_target: 'human_review',
    });
    await writeConfidenceResult(logsRootB, 'gate1', {
      node_id: 'gate1',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.92,
      escalation_threshold: 0.7,
      decision: 'autonomous',
    });

    // Run the publish command
    const result = await runPublishCommand([
      '--logs-root', logsRootA,
      '--logs-root', logsRootB,
      '--report', reportPath,
      '--target-escalation-rate', '0.25',
      '--min-samples', '2',
    ]);

    expect(result.exitCode).toBe(0);

    // Verify report was created
    const reportContent = await readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    // Schema validation
    expect(report.schema_version).toBe('confidence_tune_publication_report.v1');
    expect(report.generated_at).toBeDefined();
    expect(report.report_path).toBeDefined();
    
    // Publication metadata
    expect(report.publication.command).toBe('npm run confidence:publish');
    expect(report.publication.policy.recommendation_only).toBe(true);
    expect(report.publication.policy.requires_human_lock_review).toBe(true);
    expect(report.publication.policy.auto_apply_supported).toBe(false);
    
    // Summary validation
    expect(report.summary.overall_status).toBe('pass');
    expect(report.summary.operational_mode).toBe('recommendation-only');
    expect(report.summary.artifacts_loaded).toBeGreaterThan(0);
    
    // Check specific checks
    const ctr001 = report.checks.find((c: { id: string }) => c.id === 'CTR-001');
    expect(ctr001.status).toBe('pass');
    expect(ctr001.summary).toContain('At least one confidence_result artifact');
    
    const ctr002 = report.checks.find((c: { id: string }) => c.id === 'CTR-002');
    expect(ctr002.status).toBe('pass');
    expect(ctr002.summary).toContain('review inputs only');
    
    // Recommendations validation
    expect(report.recommendations.nodes).toBeDefined();
    expect(report.recommendations.nodes.length).toBeGreaterThan(0);
    
    // Check node-level recommendations
    const gate1Node = report.recommendations.nodes.find((n: { node_id: string }) => n.node_id === 'gate1');
    expect(gate1Node).toBeDefined();
    expect(gate1Node.sample_count).toBe(2);
    expect(gate1Node.recommendation_status).toBe('ready');
    expect(gate1Node.observed_confidence).toBeDefined();
    expect(gate1Node.observed_confidence.p50).toBeDefined();
    expect(gate1Node.recommended_threshold).toBeDefined();
  });

  it('fails when no confidence artifacts are found', async () => {
    // Empty logs root - no confidence results

    const result = await runPublishCommand([
      '--logs-root', logsRootA,
      '--report', reportPath,
    ]);

    expect(result.exitCode).toBe(1);

    const reportContent = await readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    expect(report.summary.overall_status).toBe('fail');
    expect(report.checks[0].id).toBe('CTR-001');
    expect(report.checks[0].status).toBe('fail');
  });

  it('rejects invalid target-escalation-rate values', async () => {
    const result = await runPublishCommand([
      '--logs-root', logsRootA,
      '--target-escalation-rate', '1.5',
      '--report', reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('target-escalation-rate');
  });

  it('reports insufficient samples correctly', async () => {
    // Only one sample for gate1
    await writeConfidenceResult(logsRootA, 'gate1', {
      node_id: 'gate1',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.85,
      escalation_threshold: 0.7,
      decision: 'autonomous',
    });

    const result = await runPublishCommand([
      '--logs-root', logsRootA,
      '--report', reportPath,
      '--min-samples', '5',
    ]);

    expect(result.exitCode).toBe(0);

    const reportContent = await readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    const gate1Node = report.recommendations.nodes.find((n: { node_id: string }) => n.node_id === 'gate1');
    expect(gate1Node.recommendation_status).toBe('insufficient_samples');
    expect(report.summary.nodes_insufficient_samples).toBe(1);
    expect(report.summary.nodes_ready).toBe(0);
  });

  it('tracks route candidates for escalation targets', async () => {
    // Create multiple confidence results for the same node with different targets
    const result1: ConfidenceResult = {
      node_id: 'gate1',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.45,
      escalation_threshold: 0.7,
      decision: 'escalate',
      escalation_target: 'senior_review',
    };
    const result2: ConfidenceResult = {
      node_id: 'gate1',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.35,
      escalation_threshold: 0.7,
      decision: 'escalate',
      escalation_target: 'senior_review',
    };
    const result3: ConfidenceResult = {
      node_id: 'gate1',
      confidence_signal_path: 'confidence.score',
      observed_confidence: 0.25,
      escalation_threshold: 0.7,
      decision: 'escalate',
      escalation_target: 'expert_review',
    };

    await writeConfidenceResult(logsRootA, 'gate1-instance1', result1);
    await writeConfidenceResult(logsRootA, 'gate1-instance2', result2);
    await writeConfidenceResult(logsRootA, 'gate1-instance3', result3);

    const result = await runPublishCommand([
      '--logs-root', logsRootA,
      '--report', reportPath,
      '--min-samples', '2',
    ]);

    expect(result.exitCode).toBe(0);

    const reportContent = await readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    // The node is grouped by node_id field, not directory name
    const gate1Node = report.recommendations.nodes.find((n: { node_id: string }) => n.node_id === 'gate1');
    expect(gate1Node).toBeDefined();
    expect(gate1Node.route_candidates.length).toBeGreaterThan(0);
    // senior_review should be the most frequent target (2 out of 3)
    expect(gate1Node.recommended_escalation_target).toBe('senior_review');
  });
});
