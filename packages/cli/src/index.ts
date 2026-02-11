#!/usr/bin/env node

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { parseDOT } from '../../dot-parser/src/index.js';
import {
  ExecutionEngine,
  HandlerRegistry,
  createDefaultLintEngine,
  applyModelStylesheet,
} from '../../core/src/index.js';
import { 
  StartHandler, 
  ExitHandler, 
  ToolHandler, 
  CodergenHandler,
  ConditionalHandler,
  WaitForHumanHandler,
  ParallelHandler,
  FanInHandler,
  ManagerLoopHandler
} from '../../core/src/handlers/builtin.js';
import type { RunConfig, ExecutionEvent } from '../../core/src/types/index.js';
import type { Diagnostic } from '../../core/src/lint/index.js';
import type { HumanChoice, HumanInterviewer } from '../../core/src/handlers/builtin.js';
import { createInterface } from 'node:readline';

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

program
  .name('strange-attractor')
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
      // Load and parse the DOT file
      const dotSource = await readFile(options.graph, 'utf-8');
      const graph = applyModelStylesheet(parseDOT(dotSource));

      // Load config if provided
      let config: RunConfig = {
        logs_root: options.logsRoot,
        default_provider: options.defaultProvider,
        llm_backend: options.llmBackend,
        llm_provider: options.llmProvider,
        llm_model: options.llmModel,
      };

      if (options.config) {
        const configJson = await readFile(options.config, 'utf-8');
        const userConfig = JSON.parse(configJson);
        config = { ...config, ...userConfig };
      }

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
      const dotSource = await readFile(options.graph, 'utf-8');
      const graph = applyModelStylesheet(parseDOT(dotSource));

      let config: RunConfig = {
        logs_root: options.logsRoot,
        default_provider: options.defaultProvider,
        llm_backend: options.llmBackend,
        llm_provider: options.llmProvider,
        llm_model: options.llmModel,
      };

      if (options.config) {
        const configJson = await readFile(options.config, 'utf-8');
        const userConfig = JSON.parse(configJson);
        config = { ...config, ...userConfig };
      }

      const engine = new ExecutionEngine(graph, config);
      const registry = engine.getHandlerRegistry();
      registerBuiltinHandlers(registry, { engine, interviewer: createStdinInterviewer() });

      const result = await engine.resume(options.checkpoint, cancellation.signal);
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
  registry.register('stack.observe', codergen);
  registry.register('stack.steer', codergen);
  registry.register('tool', new ToolHandler());
  registry.register('conditional', new ConditionalHandler());
  registry.register('parallel', new ParallelHandler(options.engine));
  registry.register('parallel.fan_in', new FanInHandler());
  registry.register('stack.manager_loop', new ManagerLoopHandler());

  const interviewer = options.interviewer ?? createNoopInterviewer();
  registry.register('wait.human', new WaitForHumanHandler(interviewer));
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
