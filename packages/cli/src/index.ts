#!/usr/bin/env node

import { Command } from 'commander';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { parseDOT } from '../../dot-parser/src/index.js';
import {
  ExecutionEngine,
  HandlerRegistry,
  createDefaultLintEngine,
  applyModelStylesheet,
  createReferenceTwinRuntime,
  loadDtuScenarioFixtures,
  runDtuScenarioHarness,
  scenarioSuiteSchema,
} from '../../core/src/index.js';
import { 
  StartHandler, 
  ExitHandler, 
  ToolHandler, 
  CodergenHandler,
  FailureAnalyzeHandler,
  JudgeRubricHandler,
  ConditionalHandler,
  ConfidenceGateHandler,
  WaitForHumanHandler,
  ParallelHandler,
  FanInHandler,
  ManagerLoopHandler,
  QualityGateHandler,
} from '../../core/src/handlers/builtin.js';
import type { RunConfig, ExecutionEvent, Graph, Outcome } from '../../core/src/types/index.js';
import type { Diagnostic } from '../../core/src/lint/index.js';
import type { HumanChoice, HumanInterviewer } from '../../core/src/handlers/builtin.js';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const program = new Command();

interface RunCommandOptions {
  graph: string;
  config?: string;
  logsRoot: string;
  envFile?: string[];
  llmBackend?: 'api' | 'cli';
  defaultProvider?: string;
  llmProvider?: string;
  llmModel?: string;
}

interface ValidateCommandOptions {
  graph: string;
  strict: boolean;
  envFile?: string[];
}

interface VisualizeCommandOptions {
  graph: string;
  envFile?: string[];
}

interface ResumeCommandOptions extends RunCommandOptions {
  checkpoint?: string;
}

interface ReplayCommandOptions extends RunCommandOptions {
  manifest?: string;
  checkpoint?: string;
}

interface DtuRunCommandOptions {
  fixtures: string;
  report: string;
  baselineReport?: string;
  suite?: string[];
  allowUnsatisfied?: boolean;
}

interface RunManifest {
  schema_version: 'run_manifest.v1';
  generated_at: string;
  command: 'run' | 'resume' | 'replay';
  source: {
    graph_path: string;
    config_path: string;
    manifest_path: string;
    checkpoint_path: string;
  };
  graph: {
    id: string;
    goal: string;
    label: string;
    node_count: number;
    edge_count: number;
    promotion_stage: string;
    quality_profile: string;
  };
  runtime: {
    strange_attractor_version: string;
    node_version: string;
    platform: string;
    arch: string;
  };
  run_config: {
    logs_root: string;
    checkpoint_interval: number | null;
    max_restarts: number | null;
    llm_backend: string;
    default_provider: string;
    llm_provider: string;
    llm_model: string;
    providers: Record<string, unknown>;
  };
  outcome: {
    status: string;
    failure_reason: string;
  };
  execution: {
    checkpoint_path: string;
    completed_nodes: string[];
    node_outcomes: Record<
      string,
      {
        status: string;
        failure_reason: string;
        notes: string;
        preferred_label: string;
        suggested_next_ids: string[];
      }
    >;
  };
  model_provenance: Array<{
    node_id: string;
    node_type: string;
    adapter: string;
    backend: string;
    operation: string;
    output_mode: string;
    provider: string;
    model: string;
    reasoning_effort: string;
    usage: {
      input_tokens: number | null;
      output_tokens: number | null;
      total_tokens: number | null;
      cost_usd: number | null;
    };
    tooling: {
      api_request_path: string;
      api_response_path: string;
      cli_invocation_path: string;
      stdout_path: string;
      stderr_path: string;
    };
  }>;
  artifacts: {
    logs_root: string;
    checkpoint_path: string;
    budget_usage_path: string;
  };
}

program
  .name('factorial')
  .description('A DOT-based pipeline runner for orchestrating multi-stage AI workflows')
  .version('0.1.0');

program
  .command('run')
  .description('Execute an Attractor pipeline from a DOT file')
  .requiredOption('-g, --graph <path>', 'Path to the DOT file')
  .option('-c, --config <path>', 'Path to JSON config file')
  .option('--logs-root <path>', 'Directory for logs and checkpoints', './logs')
  .option('-e, --env-file <path...>', 'Load environment variables from file(s)')
  .option('--llm-backend <backend>', 'LLM backend to use (api|cli)')
  .option('--default-provider <provider>', 'Default provider when a node omits llm_provider')
  .option('--llm-provider <provider>', 'LLM provider to use')
  .option('--llm-model <model>', 'LLM model to use')
  .action(async (options: RunCommandOptions) => {
    const cancellation = createCancellationController('Run');
    try {
      loadProviderEnvironment(options.envFile);
      const graphPath = resolve(options.graph);
      const graph = await loadGraph(graphPath);
      const config = await resolveRunConfig(options);

      // Create execution engine
      const engine = new ExecutionEngine(graph, config);
      const registry = engine.getHandlerRegistry();
      registerBuiltinHandlers(registry, { engine, interviewer: createStdinInterviewer() });

      // Listen for events
      engine.on('event', (event: ExecutionEvent) => {
        const data = toRecord(event.data);
        switch (event.type) {
          case 'RUN_START':
            console.log(`Starting pipeline: ${graph.id}`);
            break;
          case 'NODE_START':
            console.log(`  → Executing node: ${String(data.node ?? '')}`);
            break;
          case 'NODE_COMPLETE':
            console.log(`    ✓ Node complete: ${String(toRecord(data.outcome).status ?? '')}`);
            break;
          case 'NODE_FAIL':
            console.log(`    ✗ Node failed: ${String(data.error ?? '')}`);
            break;
          case 'RUN_COMPLETE':
            console.log(`\nPipeline complete: ${String(toRecord(data.outcome).status ?? '')}`);
            break;
          case 'ERROR':
            console.error(`\nError: ${String(data.error ?? '')}`);
            break;
        }
      });

      // Execute the pipeline
      const result = await engine.run(cancellation.signal);
      await writeRunManifest({
        command: 'run',
        graph,
        graphPath,
        config,
        outcome: result,
        source: {
          configPath: options.config ? resolve(options.config) : '',
          manifestPath: '',
          checkpointPath: '',
        },
      });
      const exitCode = result.status === 'SUCCESS' || result.status === 'PARTIAL_SUCCESS'
        ? 0
        : result.status === 'SKIPPED'
        ? 130
        : 1;

      process.exit(exitCode);
    } catch (error) {
      console.error('Failed to execute pipeline:', error);
      process.exit(1);
    } finally {
      cancellation.dispose();
    }
  });

program
  .command('validate')
  .description('Validate a DOT file without executing')
  .requiredOption('-g, --graph <path>', 'Path to the DOT file')
  .option('-e, --env-file <path...>', 'Load environment variables from file(s)')
  .option('--strict', 'Fail on warnings', false)
  .action(async (options: ValidateCommandOptions) => {
    try {
      loadProviderEnvironment(options.envFile);
      const dotSource = await readFile(options.graph, 'utf-8');
      const graph = applyModelStylesheet(parseDOT(dotSource));

      const registry = new HandlerRegistry();
      registerBuiltinHandlers(registry, { interviewer: createNoopInterviewer() });
      const lintEngine = createDefaultLintEngine();
      const diagnostics = lintEngine.run(graph, { handlerRegistry: registry });

      const errors = diagnostics.filter((d: Diagnostic) => d.level === 'error');
      const warnings = diagnostics.filter((d: Diagnostic) => d.level === 'warning');

      if (diagnostics.length === 0) {
        console.log('✓ Graph is valid');
        console.log(`  Nodes: ${graph.nodes.size}`);
        console.log(`  Edges: ${graph.edges.length}`);
        console.log(`  Goal: ${graph.goal || '(none)'}`);
        return;
      }

      console.log(`✗ Validation failed (${errors.length} errors, ${warnings.length} warnings)`);
      for (const diag of diagnostics) {
        const target = diag.nodeId
          ? ` node=${diag.nodeId}`
          : diag.edge
          ? ` edge=${diag.edge.from}->${diag.edge.to}`
          : '';
        console.log(`${diag.level.toUpperCase()}: ${diag.code}${target}`);
        console.log(`  ${diag.message}`);
      }

      if (errors.length > 0 || (options.strict && warnings.length > 0)) {
        process.exit(1);
      }
    } catch (error) {
      console.error('✗ Validation failed:', error);
      process.exit(1);
    }
  });

program
  .command('visualize')
  .description('Output the parsed graph structure as JSON')
  .requiredOption('-g, --graph <path>', 'Path to the DOT file')
  .option('-e, --env-file <path...>', 'Load environment variables from file(s)')
  .action(async (options: VisualizeCommandOptions) => {
    try {
      loadProviderEnvironment(options.envFile);
      const dotSource = await readFile(options.graph, 'utf-8');
      const graph = applyModelStylesheet(parseDOT(dotSource));
      
      // Convert Map to object for JSON serialization
      const output = {
        ...graph,
        nodes: Object.fromEntries(graph.nodes),
      };
      
      console.log(JSON.stringify(output, null, 2));
    } catch (error) {
      console.error('Failed to parse graph:', error);
      process.exit(1);
    }
  });

program
  .command('resume')
  .description('Resume execution from the latest or a specified checkpoint')
  .requiredOption('-g, --graph <path>', 'Path to the DOT file')
  .option('-c, --config <path>', 'Path to JSON config file')
  .option('--logs-root <path>', 'Directory for logs and checkpoints', './logs')
  .option('-e, --env-file <path...>', 'Load environment variables from file(s)')
  .option('--llm-backend <backend>', 'LLM backend to use (api|cli)')
  .option('--default-provider <provider>', 'Default provider when a node omits llm_provider')
  .option('--llm-provider <provider>', 'LLM provider to use')
  .option('--llm-model <model>', 'LLM model to use')
  .option('--checkpoint <path>', 'Path to a specific checkpoint.json')
  .action(async (options: ResumeCommandOptions) => {
    const cancellation = createCancellationController('Resume');
    try {
      loadProviderEnvironment(options.envFile);
      const graphPath = resolve(options.graph);
      const graph = await loadGraph(graphPath);
      const config = await resolveRunConfig(options);
      const checkpointPath = options.checkpoint ? resolve(options.checkpoint) : undefined;

      const engine = new ExecutionEngine(graph, config);
      const registry = engine.getHandlerRegistry();
      registerBuiltinHandlers(registry, { engine, interviewer: createStdinInterviewer() });

      const result = await engine.resume(checkpointPath, cancellation.signal);
      await writeRunManifest({
        command: 'resume',
        graph,
        graphPath,
        config,
        outcome: result,
        source: {
          configPath: options.config ? resolve(options.config) : '',
          manifestPath: '',
          checkpointPath: checkpointPath ?? '',
        },
      });
      const exitCode = result.status === 'SUCCESS' || result.status === 'PARTIAL_SUCCESS'
        ? 0
        : result.status === 'SKIPPED'
        ? 130
        : 1;

      process.exit(exitCode);
    } catch (error) {
      console.error('Failed to resume pipeline:', error);
      process.exit(1);
    } finally {
      cancellation.dispose();
    }
  });

program
  .command('replay')
  .description('Replay a prior run from a manifest with fixed config, optionally from checkpoint')
  .option('-m, --manifest <path>', 'Path to run_manifest.json from a prior run')
  .option('-g, --graph <path>', 'Path to the DOT file (overrides manifest graph path)')
  .option('-c, --config <path>', 'Path to JSON config file (used only when manifest is omitted)')
  .option('--logs-root <path>', 'Directory for replay logs', './logs/replay')
  .option('-e, --env-file <path...>', 'Load environment variables from file(s)')
  .option('--llm-backend <backend>', 'LLM backend to use when manifest is omitted (api|cli)')
  .option('--default-provider <provider>', 'Default provider when manifest is omitted')
  .option('--llm-provider <provider>', 'LLM provider when manifest is omitted')
  .option('--llm-model <model>', 'LLM model when manifest is omitted')
  .option('--checkpoint <path>', 'Checkpoint path to resume from during replay')
  .action(async (options: ReplayCommandOptions) => {
    const cancellation = createCancellationController('Replay');
    try {
      loadProviderEnvironment(options.envFile);
      const replayInputs = await resolveReplayInputs(options);
      const engine = new ExecutionEngine(replayInputs.graph, replayInputs.config);
      const registry = engine.getHandlerRegistry();
      registerBuiltinHandlers(registry, { engine, interviewer: createStdinInterviewer() });

      const result = replayInputs.checkpointPath
        ? await engine.resume(replayInputs.checkpointPath, cancellation.signal)
        : await engine.run(cancellation.signal);

      await writeRunManifest({
        command: 'replay',
        graph: replayInputs.graph,
        graphPath: replayInputs.graphPath,
        config: replayInputs.config,
        outcome: result,
        source: {
          configPath: replayInputs.configPath,
          manifestPath: replayInputs.manifestPath,
          checkpointPath: replayInputs.checkpointPath,
        },
      });

      const exitCode = result.status === 'SUCCESS' || result.status === 'PARTIAL_SUCCESS'
        ? 0
        : result.status === 'SKIPPED'
        ? 130
        : 1;
      process.exit(exitCode);
    } catch (error) {
      console.error('Failed to replay pipeline:', error);
      process.exit(1);
    } finally {
      cancellation.dispose();
    }
  });

program
  .command('dtu-run')
  .description('Run DTU scenario fixtures and emit a deterministic satisfaction report')
  .requiredOption('--fixtures <path>', 'Path to DTU scenario fixture directory')
  .option(
    '--report <path>',
    'Path to output report JSON',
    './reports/dtu_satisfaction_report.json'
  )
  .option('--baseline-report <path>', 'Optional baseline report for drift delta comparison')
  .option('--suite <suite...>', 'Optional suites to include (smoke regression holdout)')
  .option('--allow-unsatisfied', 'Do not fail command when unsatisfied scenarios are present', false)
  .action(async (options: DtuRunCommandOptions) => {
    try {
      const fixturesRoot = resolve(options.fixtures);
      const reportPath = resolve(options.report);
      const fixtures = await loadDtuScenarioFixtures(fixturesRoot);
      const suites = normalizeScenarioSuites(options.suite);
      const baseline = options.baselineReport
        ? await readBaselineReport(resolve(options.baselineReport))
        : null;
      const runtime = createReferenceTwinRuntime();
      const report = await runDtuScenarioHarness({
        runtime,
        fixtures,
        fixtures_root: fixturesRoot,
        suites,
        baseline,
      });

      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

      console.log(`DTU scenarios: ${report.totals.total}`);
      console.log(`Satisfied: ${report.totals.satisfied}`);
      console.log(`Unsatisfied: ${report.totals.unsatisfied}`);
      console.log(`Pass rate: ${report.totals.pass_rate}`);
      console.log(`Holdout rate: ${report.holdout_rate}`);
      console.log(`Report: ${reportPath}`);

      if (report.totals.unsatisfied > 0 && !options.allowUnsatisfied) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Failed to run DTU scenarios:', error);
      process.exit(1);
    }
  });

function createCancellationController(action: string): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  let cancellationRequested = false;

  const onSignal = (signal: NodeJS.Signals) => {
    if (!cancellationRequested) {
      cancellationRequested = true;
      console.error(`\n${action} cancellation requested (${signal}). Waiting for graceful shutdown...`);
      controller.abort();
      return;
    }

    console.error('\nSecond interrupt received. Exiting immediately.');
    process.exit(130);
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return {
    signal: controller.signal,
    dispose: () => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    },
  };
}

function createStdinInterviewer(): HumanInterviewer {
  return {
    ask: async (question: string, choices: HumanChoice[]) => {
      console.log(`\n${question}`);
      for (const choice of choices) {
        console.log(`  [${choice.key}] ${choice.label}`);
      }

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const validKeys = new Set(choices.map((choice: HumanChoice) => choice.key.toUpperCase()));

      const prompt = (): Promise<string> =>
        new Promise(resolve => rl.question('> ', answer => resolve(answer.trim())));

      let answer = await prompt();
      while (answer && !validKeys.has(answer.toUpperCase())) {
        console.log(`Invalid choice. Valid keys: ${choices.map((choice: HumanChoice) => choice.key).join(', ')}`);
        answer = await prompt();
      }

      rl.close();
      if (!answer) {
        return choices[0].key;
      }

      const matched = choices.find((choice: HumanChoice) => choice.key.toUpperCase() === answer.toUpperCase());
      return matched ? matched.key : choices[0].key;
    },
  };
}

function createNoopInterviewer(): HumanInterviewer {
  return {
    ask: async (_question: string, choices: HumanChoice[]) => choices[0].key,
  };
}

function registerBuiltinHandlers(
  registry: HandlerRegistry,
  options: { engine?: ExecutionEngine; interviewer?: HumanInterviewer } = {}
): void {
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
  registry.register('parallel', new ParallelHandler(options.engine));
  registry.register('parallel.fan_in', new FanInHandler());
  registry.register('quality.gate', new QualityGateHandler());
  registry.register('stack.manager_loop', new ManagerLoopHandler());

  const interviewer = options.interviewer ?? createNoopInterviewer();
  registry.register('wait.human', new WaitForHumanHandler(interviewer));
}

async function loadGraph(path: string): Promise<Graph> {
  const dotSource = await readFile(path, 'utf-8');
  return applyModelStylesheet(parseDOT(dotSource));
}

async function resolveRunConfig(options: RunCommandOptions): Promise<RunConfig> {
  let config: RunConfig = {
    logs_root: resolve(options.logsRoot),
    default_provider: options.defaultProvider,
    llm_backend: options.llmBackend,
    llm_provider: options.llmProvider,
    llm_model: options.llmModel,
  };

  if (options.config) {
    const configJson = await readFile(options.config, 'utf-8');
    const userConfig = JSON.parse(configJson) as Partial<RunConfig>;
    config = { ...config, ...userConfig };
  }

  config.logs_root = resolve(config.logs_root || options.logsRoot);
  return config;
}

async function resolveReplayInputs(options: ReplayCommandOptions): Promise<{
  graph: Graph;
  graphPath: string;
  config: RunConfig;
  configPath: string;
  manifestPath: string;
  checkpointPath: string;
}> {
  const manifestPath = options.manifest ? resolve(options.manifest) : '';
  const manifest = manifestPath ? await loadRunManifest(manifestPath) : null;
  const graphPath = resolveReplayGraphPath(options, manifest);
  const graph = await loadGraph(graphPath);

  if (manifest) {
    if (options.config || options.llmBackend || options.defaultProvider || options.llmProvider || options.llmModel) {
      throw new Error(
        'Replay from manifest uses fixed config. Remove --config and llm override flags.'
      );
    }

    const config = manifestToRunConfig(manifest);
    config.logs_root = resolve(options.logsRoot || config.logs_root || './logs/replay');
    const checkpointPath = options.checkpoint ? resolve(options.checkpoint) : '';
    return {
      graph,
      graphPath,
      config,
      configPath: '',
      manifestPath,
      checkpointPath,
    };
  }

  if (!options.graph) {
    throw new Error('Replay requires --manifest or --graph.');
  }
  const config = await resolveRunConfig(options);
  return {
    graph,
    graphPath,
    config,
    configPath: options.config ? resolve(options.config) : '',
    manifestPath: '',
    checkpointPath: options.checkpoint ? resolve(options.checkpoint) : '',
  };
}

function resolveReplayGraphPath(options: ReplayCommandOptions, manifest: RunManifest | null): string {
  if (options.graph) {
    return resolve(options.graph);
  }
  const manifestGraphPath = asNonEmptyString(manifest?.source.graph_path);
  if (manifestGraphPath) {
    return resolve(manifestGraphPath);
  }
  throw new Error('Replay requires --graph or a manifest with source.graph_path.');
}

async function loadRunManifest(path: string): Promise<RunManifest> {
  const raw = await readFile(path, 'utf-8');
  const manifest = JSON.parse(raw) as RunManifest;
  if (manifest.schema_version !== 'run_manifest.v1') {
    throw new Error(`Unsupported manifest schema: ${String((manifest as { schema_version?: unknown }).schema_version)}`);
  }
  return manifest;
}

function manifestToRunConfig(manifest: RunManifest): RunConfig {
  return {
    logs_root: manifest.run_config.logs_root,
    checkpoint_interval: manifest.run_config.checkpoint_interval ?? undefined,
    max_restarts: manifest.run_config.max_restarts ?? undefined,
    llm_backend: normalizeBackend(manifest.run_config.llm_backend),
    default_provider: asNonEmptyString(manifest.run_config.default_provider),
    llm_provider: asNonEmptyString(manifest.run_config.llm_provider),
    llm_model: asNonEmptyString(manifest.run_config.llm_model),
    providers: manifest.run_config.providers as RunConfig['providers'],
  };
}

function normalizeBackend(value: string): RunConfig['llm_backend'] {
  if (value === 'api' || value === 'cli') {
    return value;
  }
  return undefined;
}

async function writeRunManifest(options: {
  command: 'run' | 'resume' | 'replay';
  graph: Graph;
  graphPath: string;
  config: RunConfig;
  outcome: Outcome;
  source: {
    configPath: string;
    manifestPath: string;
    checkpointPath: string;
  };
}): Promise<void> {
  const logsRoot = resolve(options.config.logs_root);
  await mkdir(logsRoot, { recursive: true });
  const checkpointPath = join(logsRoot, 'checkpoint.json');
  const checkpointData = await readCheckpointIfPresent(checkpointPath);
  const contextValues = isRecord(checkpointData?.context) ? checkpointData.context : {};
  const nodeOutcomes = isRecord(checkpointData?.node_outcomes) ? checkpointData.node_outcomes : {};
  const completedNodes = Array.isArray(checkpointData?.completed_nodes)
    ? checkpointData.completed_nodes.map(value => String(value))
    : [];
  const manifestPath = join(logsRoot, 'run_manifest.json');
  const version = await resolvePackageVersion();

  const manifest: RunManifest = {
    schema_version: 'run_manifest.v1',
    generated_at: new Date().toISOString(),
    command: options.command,
    source: {
      graph_path: options.graphPath,
      config_path: options.source.configPath,
      manifest_path: options.source.manifestPath,
      checkpoint_path: options.source.checkpointPath,
    },
    graph: {
      id: options.graph.id,
      goal: options.graph.goal ?? '',
      label: options.graph.label ?? '',
      node_count: options.graph.nodes.size,
      edge_count: options.graph.edges.length,
      promotion_stage: asNonEmptyString(options.graph.attributes.promotion_stage) ?? '',
      quality_profile: asNonEmptyString(options.graph.attributes.quality_profile) ?? '',
    },
    runtime: {
      strange_attractor_version: version,
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    run_config: {
      logs_root: logsRoot,
      checkpoint_interval: options.config.checkpoint_interval ?? null,
      max_restarts: options.config.max_restarts ?? null,
      llm_backend: options.config.llm_backend ?? '',
      default_provider: options.config.default_provider ?? '',
      llm_provider: options.config.llm_provider ?? '',
      llm_model: options.config.llm_model ?? '',
      providers: (options.config.providers ?? {}) as Record<string, unknown>,
    },
    outcome: {
      status: options.outcome.status,
      failure_reason: options.outcome.failure_reason ?? '',
    },
    execution: {
      checkpoint_path: checkpointData ? checkpointPath : '',
      completed_nodes: completedNodes,
      node_outcomes: normalizeManifestNodeOutcomes(nodeOutcomes),
    },
    model_provenance: collectModelProvenance(options.graph, contextValues, options.config, nodeOutcomes),
    artifacts: {
      logs_root: logsRoot,
      checkpoint_path: checkpointData ? checkpointPath : '',
      budget_usage_path: existsSync(join(logsRoot, 'budget_usage.json')) ? join(logsRoot, 'budget_usage.json') : '',
    },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function normalizeManifestNodeOutcomes(nodeOutcomes: Record<string, unknown>): RunManifest['execution']['node_outcomes'] {
  const normalized: RunManifest['execution']['node_outcomes'] = {};
  for (const [nodeId, rawOutcome] of Object.entries(nodeOutcomes)) {
    const outcome = toRecord(rawOutcome);
    normalized[nodeId] = {
      status: asNonEmptyString(outcome.status) ?? '',
      failure_reason: asNonEmptyString(outcome.failure_reason) ?? '',
      notes: asNonEmptyString(outcome.notes) ?? '',
      preferred_label: asNonEmptyString(outcome.preferred_label) ?? '',
      suggested_next_ids: Array.isArray(outcome.suggested_next_ids)
        ? outcome.suggested_next_ids.map(value => String(value))
        : [],
    };
  }
  return normalized;
}

function collectModelProvenance(
  graph: Graph,
  contextValues: Record<string, unknown>,
  config: RunConfig,
  nodeOutcomes: Record<string, unknown>
): RunManifest['model_provenance'] {
  const records: RunManifest['model_provenance'] = [];
  for (const [nodeId, node] of graph.nodes) {
    if (!nodeOutcomes[nodeId]) {
      continue;
    }
    const modelNodeType = node.type || '';
    if (!isModelBackedType(modelNodeType)) {
      continue;
    }

    const prefix = `codergen.${nodeId}.`;
    const adapter = asNonEmptyString(contextValues[`${prefix}adapter`]) ?? '';
    const provider = asNonEmptyString(contextValues[`${prefix}provider`])
      ?? node.llm_provider
      ?? config.llm_provider
      ?? config.default_provider
      ?? '';
    const model = asNonEmptyString(contextValues[`${prefix}model`])
      ?? node.llm_model
      ?? config.llm_model
      ?? '';
    const backend = asNonEmptyString(contextValues[`${prefix}backend`])
      ?? asNonEmptyString(node.attributes.llm_backend)
      ?? config.llm_backend
      ?? '';
    const operation = asNonEmptyString(contextValues[`${prefix}operation`]) ?? '';
    const outputMode = asNonEmptyString(contextValues[`${prefix}output_mode`]) ?? '';
    const reasoningEffort = asNonEmptyString(contextValues[`${prefix}reasoning_effort`])
      ?? node.reasoning_effort
      ?? '';

    records.push({
      node_id: nodeId,
      node_type: modelNodeType,
      adapter,
      backend,
      operation,
      output_mode: outputMode,
      provider,
      model,
      reasoning_effort: reasoningEffort,
      usage: {
        input_tokens: asFiniteNumber(contextValues[`${prefix}usage.input_tokens`]) ?? null,
        output_tokens: asFiniteNumber(contextValues[`${prefix}usage.output_tokens`]) ?? null,
        total_tokens: asFiniteNumber(contextValues[`${prefix}usage.total_tokens`]) ?? null,
        cost_usd: asFiniteNumber(contextValues[`${prefix}usage.cost_usd`]) ?? null,
      },
      tooling: {
        api_request_path: asNonEmptyString(contextValues[`${prefix}api_request_path`]) ?? '',
        api_response_path: asNonEmptyString(contextValues[`${prefix}api_response_path`]) ?? '',
        cli_invocation_path: asNonEmptyString(contextValues[`${prefix}cli_invocation_path`]) ?? '',
        stdout_path: asNonEmptyString(contextValues[`${prefix}stdout_path`]) ?? '',
        stderr_path: asNonEmptyString(contextValues[`${prefix}stderr_path`]) ?? '',
      },
    });
  }
  return records.sort((left, right) => left.node_id.localeCompare(right.node_id));
}

function isModelBackedType(type: string): boolean {
  return (
    type === 'codergen' ||
    type === 'judge.rubric' ||
    type === 'failure.analyze' ||
    type === 'stack.observe' ||
    type === 'stack.steer'
  );
}

async function readCheckpointIfPresent(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

let cachedPackageVersion: string | null = null;

async function resolvePackageVersion(): Promise<string> {
  if (cachedPackageVersion) {
    return cachedPackageVersion;
  }
  if (asNonEmptyString(process.env.npm_package_version)) {
    cachedPackageVersion = process.env.npm_package_version as string;
    return cachedPackageVersion;
  }

  let currentDir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = join(currentDir, 'package.json');
    if (existsSync(candidate)) {
      try {
        const packageJson = JSON.parse(await readFile(candidate, 'utf-8')) as { version?: unknown };
        const version = asNonEmptyString(packageJson.version) ?? '0.0.0';
        cachedPackageVersion = version;
        return version;
      } catch {
        break;
      }
    }
    const parent = dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  cachedPackageVersion = '0.0.0';
  return cachedPackageVersion;
}

function normalizeScenarioSuites(rawSuites?: string[]): Array<'smoke' | 'regression' | 'holdout'> | undefined {
  if (!rawSuites || rawSuites.length === 0) {
    return undefined;
  }

  const suites = rawSuites.map(suite => scenarioSuiteSchema.parse(suite));
  return Array.from(new Set(suites));
}

async function readBaselineReport(
  path: string
): Promise<{
  totals: { total: number; satisfied: number; unsatisfied: number; pass_rate: number };
  holdout_rate: number;
}> {
  const raw = await readFile(path, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const totals = toRecord(parsed.totals);
  return {
    totals: {
      total: asFiniteNumber(totals.total) ?? 0,
      satisfied: asFiniteNumber(totals.satisfied) ?? 0,
      unsatisfied: asFiniteNumber(totals.unsatisfied) ?? 0,
      pass_rate: asFiniteNumber(totals.pass_rate) ?? 0,
    },
    holdout_rate: asFiniteNumber(parsed.holdout_rate) ?? 0,
  };
}

program.parse();

function loadProviderEnvironment(extraEnvFiles?: string[]): void {
  const files = normalizeEnvFileList(extraEnvFiles);
  for (const envFile of files) {
    const resolvedPath = resolve(envFile);
    const shouldExist = !isDefaultEnvFile(envFile);
    if (!existsSync(resolvedPath)) {
      if (shouldExist) {
        throw new Error(`Env file not found: ${envFile}`);
      }
      continue;
    }
    const result = loadDotEnv({ path: resolvedPath, override: false });
    if (result.error) {
      throw result.error;
    }
  }
}

function normalizeEnvFileList(extraEnvFiles?: string[]): string[] {
  const files: string[] = ['.env', '.env.local'];
  if (Array.isArray(extraEnvFiles)) {
    for (const file of extraEnvFiles) {
      files.push(file);
    }
  }
  return Array.from(new Set(files.map(entry => entry.trim()).filter(Boolean)));
}

function isDefaultEnvFile(path: string): boolean {
  return path === '.env' || path === '.env.local';
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
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
