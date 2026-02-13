import { describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseDOT } from '../../packages/dot-parser/src/index.js';
import {
  applyModelStylesheet,
  Context,
  createDefaultLintEngine,
  ExecutionEngine,
  HandlerRegistry,
} from '../../packages/core/src/index.js';
import type { Diagnostic } from '../../packages/core/src/lint/index.js';
import type { ExecutionEvent, Graph } from '../../packages/core/src/types/index.js';
import {
  CodergenHandler,
  ConfidenceGateHandler,
  ConditionalHandler,
  ExitHandler,
  FailureAnalyzeHandler,
  FanInHandler,
  JudgeRubricHandler,
  ManagerLoopHandler,
  ParallelHandler,
  QualityGateHandler,
  StartHandler,
  ToolHandler,
  WaitForHumanHandler,
} from '../../packages/core/src/handlers/builtin.js';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

const ROOT_DIR = new URL('../../', import.meta.url);
const WORKFLOWS_DIR = new URL('./workflows/', import.meta.url);
const EXPECTED_DIR = new URL('./expected/', import.meta.url);
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1';

interface GoldenNodeSnapshot {
  output?: {
    status: string;
    output_mode: string;
    output: unknown;
    validation_result: string;
    validation_errors: unknown[];
    failure_reason: string;
  };
  validation?: {
    result: string;
    checked: boolean;
    errors: unknown[];
    output_contract_required: boolean;
    schema_configured: boolean;
  };
  gate_result?: {
    gate_type: string;
    raw_outcome: string;
    normalized_outcome: string;
    normalized_passed: boolean;
    failure_target: string;
    exit_code: number | null;
  };
  fan_in_decision?: {
    merge_strategy: string;
    merge_tiebreak: string;
    selected: {
      branch_id: string;
      status: string;
      score: number;
      index: number;
    };
    selected_output: unknown;
    consensus_count: number;
    branch_scores: Array<{
      branch_id: string;
      status: string;
      score: number;
      weight: number;
      result_index: number;
    }>;
  };
  budget_result?: {
    breached: boolean;
    errors: unknown[];
    usage: {
      tokens_used: number;
      cost_usd: number;
      duration_ms: number;
    };
    limits: {
      max_tokens: number | null;
      max_cost_usd: number | null;
      max_duration_ms: number | null;
    };
    run_totals: {
      tokens_used: number;
      cost_usd: number;
      duration_ms: number;
    };
  };
  confidence_result?: {
    confidence_signal_path: string;
    observed_confidence: number;
    escalation_threshold: number;
    decision: string;
    escalation_target: string;
  };
  manager_loop?: {
    child_dotfile: string;
    actions: string[];
    poll_interval_ms: number;
    max_cycles: number;
    require_lock_decision: boolean;
    cycle_count: number;
    final_status: string;
    final_child_status: string;
    final_child_outcome: string;
    final_child_lock: string;
  };
}

interface GoldenSnapshot {
  workflow: string;
  run: {
    status: string;
    failure_reason: string;
  };
  executed_nodes: string[];
  run_budget?: {
    breached: boolean;
    errors: unknown[];
    totals: {
      tokens_used: number;
      cost_usd: number;
      duration_ms: number;
    };
    limits: {
      max_tokens: number | null;
      max_cost_usd: number | null;
      max_duration_ms: number | null;
    };
  };
  nodes: Record<string, GoldenNodeSnapshot>;
}

describe('Golden Workflow Regression Suite', () => {
  it('matches normalized outcomes and artifacts for all golden workflows', async () => {
    const workflowFiles = (await readdir(WORKFLOWS_DIR))
      .filter(entry => entry.endsWith('.dot'))
      .sort();

    expect(workflowFiles.length).toBeGreaterThan(0);

    for (const workflowFile of workflowFiles) {
      const workflowPath = new URL(`./workflows/${workflowFile}`, import.meta.url);
      const expectedPath = new URL(`./expected/${workflowFile.replace(/\.dot$/, '.json')}`, import.meta.url);
      const snapshot = await runWorkflowAndCapture(workflowPath);

      if (UPDATE_GOLDEN) {
        await writeFile(expectedPath, `${JSON.stringify(snapshot, null, 2)}\n`);
        continue;
      }

      const expectedRaw = await readFile(expectedPath, 'utf-8');
      const expected = JSON.parse(expectedRaw) as GoldenSnapshot;
      expect(snapshot).toEqual(expected);
    }
  });
});

async function runWorkflowAndCapture(workflowPath: URL): Promise<GoldenSnapshot> {
  const source = await readFile(workflowPath, 'utf-8');
  const graph = applyModelStylesheet(parseDOT(source));
  const workflow = basename(workflowPath.pathname);
  const logsRoot = await mkdtemp(join(tmpdir(), `attractor-golden-${workflow.replace('.dot', '-')}`));
  const context = new Context();
  await applyGoldenSeedContext(graph, context);

  const registry = createGoldenHandlerRegistry();
  const lintDiagnostics = createDefaultLintEngine().run(graph, { handlerRegistry: registry });
  const lintErrors = lintDiagnostics.filter((diagnostic: Diagnostic) => diagnostic.level === 'error');
  expect(lintErrors).toEqual([]);

  const engine = new ExecutionEngine(
    graph,
    {
      logs_root: logsRoot,
      llm_backend: 'cli',
      default_provider: 'openai',
      llm_provider: 'openai',
      llm_model: 'gpt-test',
    },
    {
      context,
      handlerRegistry: registry,
    }
  );

  const executedNodes: string[] = [];
  engine.on('event', (event: ExecutionEvent) => {
    if (event.type !== 'NODE_START') {
      return;
    }
    const data = event.data as Record<string, unknown>;
    if (typeof data.node === 'string') {
      executedNodes.push(data.node);
    }
  });

  const outcome = await engine.run();

  const nodes: Record<string, GoldenNodeSnapshot> = {};
  for (const nodeId of graph.nodes.keys()) {
    const nodeSnapshot = await captureNodeSnapshot(logsRoot, nodeId);
    if (nodeSnapshot) {
      nodes[nodeId] = nodeSnapshot;
    }
  }

  const runBudget = await captureRunBudget(logsRoot);
  const snapshot: GoldenSnapshot = {
    workflow,
    run: {
      status: outcome.status,
      failure_reason: normalizeBudgetMessage(outcome.failure_reason ?? ''),
    },
    executed_nodes: executedNodes,
    nodes,
  };
  if (runBudget) {
    snapshot.run_budget = runBudget;
  }

  return stableSort(snapshot);
}

async function applyGoldenSeedContext(graph: Graph, context: Context): Promise<void> {
  const attributes = graph.attributes || {};
  const seedContextPath = asNonEmptyString(attributes.golden_seed_context_path);
  if (seedContextPath) {
    const resolvedPath = new URL(seedContextPath, ROOT_DIR);
    const raw = await readFile(resolvedPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      await context.set(key, value);
    }
  }

  const inlineSeedRaw = attributes.golden_seed_context;
  if (inlineSeedRaw === undefined) {
    return;
  }
  const inlineSeed =
    typeof inlineSeedRaw === 'string'
      ? (JSON.parse(inlineSeedRaw) as Record<string, unknown>)
      : (inlineSeedRaw as Record<string, unknown>);
  for (const [key, value] of Object.entries(inlineSeed)) {
    await context.set(key, value);
  }
}

function createGoldenHandlerRegistry(): HandlerRegistry {
  const registry = new HandlerRegistry();
  const codergen = new CodergenHandler();

  registry.register('start', new StartHandler());
  registry.register('exit', new ExitHandler());
  registry.register('codergen', codergen);
  registry.register('failure.analyze', new FailureAnalyzeHandler(codergen));
  registry.register('judge.rubric', new JudgeRubricHandler(codergen));
  registry.register('stack.observe', codergen);
  registry.register('stack.steer', codergen);
  registry.register('tool', new ToolHandler());
  registry.register('conditional', new ConditionalHandler());
  registry.register('confidence.gate', new ConfidenceGateHandler());
  registry.register('parallel', new ParallelHandler());
  registry.register('parallel.fan_in', new FanInHandler());
  registry.register('quality.gate', new QualityGateHandler());
  registry.register('stack.manager_loop', new ManagerLoopHandler());
  registry.register(
    'wait.human',
    new WaitForHumanHandler({
      ask: async (_question, choices) => choices[0].key,
    })
  );
  return registry;
}

async function captureNodeSnapshot(
  logsRoot: string,
  nodeId: string
): Promise<GoldenNodeSnapshot | null> {
  const stageDir = join(logsRoot, nodeId);
  const output = await readJsonIfPresent(join(stageDir, 'output.json'));
  const validation = await readJsonIfPresent(join(stageDir, 'validation.json'));
  const gateResult = await readJsonIfPresent(join(stageDir, 'gate_result.json'));
  const fanInDecision = await readJsonIfPresent(join(stageDir, 'fan_in_decision.json'));
  const budgetResult = await readJsonIfPresent(join(stageDir, 'budget_result.json'));
  const confidenceResult = await readJsonIfPresent(join(stageDir, 'confidence_result.json'));
  const managerLoop = await readJsonIfPresent(join(stageDir, 'manager_loop.json'));

  const snapshot: GoldenNodeSnapshot = {};
  if (isRecord(output)) {
    snapshot.output = {
      status: asNonEmptyString(output.status) ?? '',
      output_mode: asNonEmptyString(output.output_mode) ?? '',
      output: output.output,
      validation_result: asNonEmptyString(output.validation_result) ?? '',
      validation_errors: Array.isArray(output.validation_errors) ? output.validation_errors : [],
      failure_reason: asNonEmptyString(output.failure_reason) ?? '',
    };
  }

  if (isRecord(validation)) {
    snapshot.validation = {
      result: asNonEmptyString(validation.result) ?? '',
      checked: Boolean(validation.checked),
      errors: Array.isArray(validation.errors) ? validation.errors : [],
      output_contract_required: Boolean(validation.output_contract_required),
      schema_configured: Boolean(validation.schema_configured),
    };
  }

  if (isRecord(gateResult)) {
    snapshot.gate_result = {
      gate_type: asNonEmptyString(gateResult.gate_type) ?? '',
      raw_outcome: asNonEmptyString(gateResult.raw_outcome) ?? '',
      normalized_outcome: asNonEmptyString(gateResult.normalized_outcome) ?? '',
      normalized_passed: Boolean(gateResult.normalized_passed),
      failure_target: asNonEmptyString(gateResult.failure_target) ?? '',
      exit_code: asNullableNumber(gateResult.exit_code),
    };
  }

  if (isRecord(fanInDecision)) {
    const selectedRaw = isRecord(fanInDecision.selected) ? fanInDecision.selected : {};
    const branchScores = Array.isArray(fanInDecision.branch_scores)
      ? fanInDecision.branch_scores
          .filter(isRecord)
          .map(score => ({
            branch_id: asNonEmptyString(score.branch_id) ?? '',
            status: asNonEmptyString(score.status) ?? '',
            score: asNumber(score.score) ?? 0,
            weight: asNumber(score.weight) ?? 0,
            result_index: asNumber(score.result_index) ?? 0,
          }))
          .sort((left, right) => left.branch_id.localeCompare(right.branch_id))
      : [];

    snapshot.fan_in_decision = {
      merge_strategy: asNonEmptyString(fanInDecision.merge_strategy) ?? '',
      merge_tiebreak: asNonEmptyString(fanInDecision.merge_tiebreak) ?? '',
      selected: {
        branch_id: asNonEmptyString(selectedRaw.branch_id) ?? '',
        status: asNonEmptyString(selectedRaw.status) ?? '',
        score: asNumber(selectedRaw.score) ?? 0,
        index: asNumber(selectedRaw.index) ?? 0,
      },
      selected_output: fanInDecision.selected_output,
      consensus_count: asNumber(fanInDecision.consensus_count) ?? 0,
      branch_scores: branchScores,
    };
  }

  if (isRecord(confidenceResult)) {
    snapshot.confidence_result = {
      confidence_signal_path: asNonEmptyString(confidenceResult.confidence_signal_path) ?? '',
      observed_confidence: asNumber(confidenceResult.observed_confidence) ?? 0,
      escalation_threshold: asNumber(confidenceResult.escalation_threshold) ?? 0,
      decision: asNonEmptyString(confidenceResult.decision) ?? '',
      escalation_target: asNonEmptyString(confidenceResult.escalation_target) ?? '',
    };
  }

  if (isRecord(managerLoop)) {
    snapshot.manager_loop = {
      child_dotfile: asNonEmptyString(managerLoop.child_dotfile) ?? '',
      actions: Array.isArray(managerLoop.actions)
        ? managerLoop.actions
            .filter(action => typeof action === 'string')
            .map(action => String(action))
        : [],
      poll_interval_ms: asNumber(managerLoop.poll_interval_ms) ?? 0,
      max_cycles: asNumber(managerLoop.max_cycles) ?? 0,
      require_lock_decision: Boolean(managerLoop.require_lock_decision),
      cycle_count: asNumber(managerLoop.cycle_count) ?? 0,
      final_status: asNonEmptyString(managerLoop.final_status) ?? '',
      final_child_status: asNonEmptyString(managerLoop.final_child_status) ?? '',
      final_child_outcome: asNonEmptyString(managerLoop.final_child_outcome) ?? '',
      final_child_lock: asNonEmptyString(managerLoop.final_child_lock) ?? '',
    };
  }

  if (isRecord(budgetResult)) {
    const usageRaw = isRecord(budgetResult.usage) ? budgetResult.usage : {};
    const limitsRaw = isRecord(budgetResult.limits) ? budgetResult.limits : {};
    const runTotalsRaw = isRecord(budgetResult.run_totals) ? budgetResult.run_totals : {};

    snapshot.budget_result = {
      breached: Boolean(budgetResult.breached),
      errors: normalizeBudgetErrors(budgetResult.errors),
      usage: {
        tokens_used: asNumber(usageRaw.tokens_used) ?? 0,
        cost_usd: asNumber(usageRaw.cost_usd) ?? 0,
        duration_ms: normalizeDurationMetric(usageRaw.duration_ms),
      },
      limits: {
        max_tokens: asNullableNumber(limitsRaw.max_tokens),
        max_cost_usd: asNullableNumber(limitsRaw.max_cost_usd),
        max_duration_ms: asNullableNumber(limitsRaw.max_duration_ms),
      },
      run_totals: {
        tokens_used: asNumber(runTotalsRaw.tokens_used) ?? 0,
        cost_usd: asNumber(runTotalsRaw.cost_usd) ?? 0,
        duration_ms: normalizeDurationMetric(runTotalsRaw.duration_ms),
      },
    };
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

async function captureRunBudget(logsRoot: string): Promise<GoldenSnapshot['run_budget'] | undefined> {
  const runBudget = await readJsonIfPresent(join(logsRoot, 'budget_usage.json'));
  if (!isRecord(runBudget)) {
    return undefined;
  }

  const totalsRaw = isRecord(runBudget.totals) ? runBudget.totals : {};
  const limitsRaw = isRecord(runBudget.limits) ? runBudget.limits : {};
  return {
    breached: Boolean(runBudget.breached),
    errors: normalizeBudgetErrors(runBudget.errors),
    totals: {
      tokens_used: asNumber(totalsRaw.tokens_used) ?? 0,
      cost_usd: asNumber(totalsRaw.cost_usd) ?? 0,
      duration_ms: normalizeDurationMetric(totalsRaw.duration_ms),
    },
    limits: {
      max_tokens: asNullableNumber(limitsRaw.max_tokens),
      max_cost_usd: asNullableNumber(limitsRaw.max_cost_usd),
      max_duration_ms: asNullableNumber(limitsRaw.max_duration_ms),
    },
  };
}

async function readJsonIfPresent(path: string): Promise<unknown> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asNullableNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === undefined ? null : parsed;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSort<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(entry => stableSort(entry)) as T;
  }
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSort(value[key]);
        return acc;
      }, {}) as T;
  }
  return value;
}

function normalizeDurationMetric(_value: unknown): number {
  return 0;
}

function normalizeBudgetErrors(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(entry => {
    if (typeof entry !== 'string') {
      return entry;
    }
    return normalizeBudgetMessage(entry);
  });
}

function normalizeBudgetMessage(value: string): string {
  return value.replace(/\((\d+(?:\.\d+)?)\s*>\s*(\d+(?:\.\d+)?)\)/g, '(<actual> > <limit>)');
}
