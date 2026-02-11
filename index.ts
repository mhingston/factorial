/**
 * Strange Attractor - A DOT-based pipeline runner for orchestrating multi-stage AI workflows
 * 
 * This is the main entry point for the strange-attractor package.
 * 
 * @example
 * ```typescript
 * import { Attractor } from 'strange-attractor';
 * 
 * const attractor = new Attractor({
 *   dotFile: './workflow.dot',
 *   logsRoot: './logs',
 * });
 * 
 * const result = await attractor.run();
 * ```
 */

export { parseDOT, DOTParserError } from './packages/dot-parser/src/index.js';
export type { 
  ParseOptions, 
  ParseError,
  ParsedNode,
  ParsedEdge,
  ParsedGraph 
} from './packages/dot-parser/src/index.js';

export {
  ExecutionEngine,
  ExecutionCancelledError,
  Context,
  CheckpointManager,
  HandlerRegistry,
  createDefaultLintEngine,
  applyModelStylesheet,
  parseModelStylesheet,
  StylesheetError,
  StartHandler,
  ExitHandler,
  ToolHandler,
  CodergenHandler,
  ConditionalHandler,
  WaitForHumanHandler,
  ParallelHandler,
  FanInHandler,
  ManagerLoopHandler,
} from './packages/core/src/index.js';

export type {
  Graph,
  Node,
  Edge,
  Outcome,
  RunConfig,
  ProviderConfig,
  Checkpoint,
  ExecutionEvent,
  Handler,
  Context as ContextInterface,
  RetryPolicy,
  BackoffConfig,
  StageStatus,
  HumanChoice,
  HumanInterviewer,
} from './packages/core/src/index.js';

// Main Attractor class for easy usage
import { parseDOT } from './packages/dot-parser/src/index.js';
import { ExecutionEngine, applyModelStylesheet } from './packages/core/src/index.js';
import type { HandlerRegistry, RunConfig, Graph, Outcome } from './packages/core/src/index.js';

export interface AttractorOptions {
  dotFile: string;
  logsRoot: string;
  llmBackend?: 'api' | 'cli';
  defaultProvider?: string;
  llmProvider?: string;
  llmModel?: string;
  providers?: RunConfig['providers'];
  config?: Record<string, unknown>;
}

export class Attractor {
  private options: AttractorOptions;
  private engine: ExecutionEngine | null = null;

  constructor(options: AttractorOptions) {
    this.options = options;
  }

  /**
   * Load and parse the DOT file
   */
  async load(): Promise<Graph> {
    const { readFile } = await import('node:fs/promises');
    const dotSource = await readFile(this.options.dotFile, 'utf-8');
    const graph = parseDOT(dotSource);
    return applyModelStylesheet(graph);
  }

  /**
   * Run the pipeline
   */
  async run(): Promise<Outcome> {
    const graph = await this.load();
    
    const config: RunConfig = {
      logs_root: this.options.logsRoot,
      llm_backend: this.options.llmBackend,
      default_provider: this.options.defaultProvider,
      llm_provider: this.options.llmProvider,
      llm_model: this.options.llmModel,
      providers: this.options.providers,
      ...this.options.config,
    };

    this.engine = new ExecutionEngine(graph, config);
    return this.engine.run();
  }

  /**
   * Get the handler registry to register custom handlers
   */
  getHandlerRegistry(): HandlerRegistry | null {
    return this.engine?.getHandlerRegistry() ?? null;
  }

  /**
   * Listen to execution events
   */
  on(event: string, listener: (...args: unknown[]) => void): void {
    this.engine?.on(event, listener);
  }
}

export default Attractor;
