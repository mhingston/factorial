import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CheckpointManager } from '../checkpoint/index.js';
import { evaluateCondition } from '../conditions/index.js';
import { Context as ContextImpl } from '../context/index.js';
import { HandlerRegistry } from '../handlers/registry.js';
import type { 
  Context,
  Edge, 
  ExecutionEvent,
  Graph, 
  Node, 
  Outcome, 
  RetryPolicy,
  RunConfig, 
} from '../types/index.js';
import { DEFAULT_BACKOFF_CONFIG } from '../types/index.js';
import { type LoopDetectionConfig, LoopDetector } from './loop-detector.js';

const CANCEL_MESSAGE = 'Execution cancelled';
type RetryPolicyType = 'none' | 'standard' | 'targeted';
type FailureClass = 'transient' | 'quality_gap' | 'tool_error' | 'spec_mismatch';

interface BudgetLimits {
  max_tokens?: number;
  max_cost_usd?: number;
  max_duration_ms?: number;
}

interface BudgetUsageTotals {
  tokens_used: number;
  cost_usd: number;
  duration_ms: number;
}

interface BudgetNodeSummary {
  node_id: string;
  limits: BudgetLimits;
  usage: BudgetUsageTotals;
  run_totals: BudgetUsageTotals;
  run_limits: BudgetLimits;
  breached: boolean;
  errors: string[];
  timestamp: string;
}

interface BudgetEvaluationResult {
  outcome: Outcome;
  breached: boolean;
}

interface RunSegmentRecord {
  segment_index: number;
  logs_root: string;
  started_at: string;
  restart: boolean;
  restarted_from?: string;
  target?: string;
}

/**
 * The core execution engine for Attractor pipelines
 */
export class ExecutionEngine extends EventEmitter {
  private graph: Graph;
  private config: RunConfig;
  private context: Context;
  private checkpointManager: CheckpointManager;
  private handlerRegistry: HandlerRegistry;
  private loopDetector: LoopDetector;
  private completedNodes: string[] = [];
  private nodeOutcomes: Map<string, Outcome> = new Map();
  private nodeRetries: Map<string, number> = new Map();
  private logs: string[] = [];
  private runStartedAtMs = 0;
  private runBudgetLimits: BudgetLimits = {};
  private runBudgetTotals: BudgetUsageTotals = {
    tokens_used: 0,
    cost_usd: 0,
    duration_ms: 0,
  };
  private budgetNodeSummaries: Record<string, BudgetNodeSummary> = {};
  private activeLogsRoot: string;
  private runSegmentIndex = 0;
  private restartCount = 0;
  private maxRestarts = 0;
  private runSegments: RunSegmentRecord[] = [];

  private cwd?: string;

  constructor(
    graph: Graph,
    config: RunConfig,
    options: { 
      context?: Context; 
      handlerRegistry?: HandlerRegistry;
      loopDetectionConfig?: Partial<LoopDetectionConfig>;
      cwd?: string;
    } = {}
  ) {
    super();
    this.graph = graph;
    this.config = config;
    this.activeLogsRoot = config.logs_root;
    this.context = options.context ?? new ContextImpl();
    this.checkpointManager = new CheckpointManager(config.logs_root);
    this.handlerRegistry = options.handlerRegistry ?? new HandlerRegistry();
    this.loopDetector = new LoopDetector(options.loopDetectionConfig);
    this.cwd = options.cwd;
  }

  /**
   * Get the handler registry for registering custom handlers
   */
  getHandlerRegistry(): HandlerRegistry {
    return this.handlerRegistry;
  }

  /**
   * Create a branch engine for parallel execution
   */
  async createBranchEngine(context: Context, logsRoot: string, cwd?: string): Promise<ExecutionEngine> {
    const branchConfig: RunConfig = { ...this.config, logs_root: logsRoot };
    return new ExecutionEngine(this.graph, branchConfig, {
      context,
      handlerRegistry: this.handlerRegistry,
      cwd,
    });
  }

  /**
   * Get the working directory for this engine
   */
  getCwd(): string | undefined {
    return this.cwd;
  }

  /**
   * Run the graph starting from a specific node
   */
  async runFromNode(startNodeId: string, signal?: AbortSignal): Promise<Outcome> {
    await this.initialize();
    try {
      return await this.executeFrom(startNodeId, null, null, signal);
    } catch (error) {
      if (error instanceof ExecutionCancelledError) {
        return {
          status: 'SKIPPED',
          context_updates: {},
          notes: CANCEL_MESSAGE,
        };
      }
      throw error;
    }
  }

  /**
   * Main execution entry point
   */
  async run(signal?: AbortSignal): Promise<Outcome> {
    try {
      // INITIALIZE phase
      await this.initialize();
      
      // EXECUTE phase
      const result = await this.execute(signal);
      
      // FINALIZE phase
      await this.finalize(result);
      
      return result;
    } catch (error) {
      if (error instanceof ExecutionCancelledError) {
        const skippedOutcome: Outcome = {
          status: 'SKIPPED',
          context_updates: {},
          notes: CANCEL_MESSAGE,
        };
        await this.finalize(skippedOutcome);
        return skippedOutcome;
      }

      const failureOutcome: Outcome = {
        status: 'FAIL',
        failure_reason: error instanceof Error ? error.message : String(error),
        context_updates: {},
      };
      
      this.emit('event', {
        type: 'ERROR',
        timestamp: new Date(),
        data: { error },
      } as ExecutionEvent);
      
      return failureOutcome;
    }
  }

  /**
   * Resume execution from the latest or specified checkpoint
   */
  async resume(checkpointPath?: string, signal?: AbortSignal): Promise<Outcome> {
    try {
      await this.initialize();
      this.assertNotCancelled(signal);

      const checkpoint = checkpointPath
        ? await this.checkpointManager.load(checkpointPath)
        : await this.checkpointManager.loadLatest();

      if (!checkpoint) {
        throw new Error('No checkpoint found to resume');
      }

      this.context = CheckpointManager.restoreContext(checkpoint);
      await this.restoreSegmentStateFromContext();
      this.completedNodes = [...checkpoint.completed_nodes];
      this.nodeRetries = new Map(Object.entries(checkpoint.node_retries));
      this.logs = [...checkpoint.logs];
      this.nodeOutcomes = new Map(Object.entries(checkpoint.node_outcomes || {}));
      this.assertNotCancelled(signal);

      const lastNode = this.graph.nodes.get(checkpoint.current_node);
      if (!lastNode) {
        throw new Error(`Checkpoint node not found: ${checkpoint.current_node}`);
      }

      const lastOutcome = this.nodeOutcomes.get(checkpoint.current_node) || null;
      if (!lastOutcome) {
        throw new Error(`Checkpoint missing outcome for node: ${checkpoint.current_node}`);
      }

      if (this.isTerminal(lastNode)) {
        const gateResult = this.checkGoalGates();
        if (!gateResult.ok && gateResult.failedGate) {
          const retryTarget = this.getRetryTarget(gateResult.failedGate);
          if (!retryTarget) {
            throw new Error('Goal gate unsatisfied and no retry target');
          }
          return await this.executeFrom(retryTarget, lastOutcome, null, signal);
        }
        return lastOutcome;
      }

      const nextEdge = this.selectEdge(lastNode, lastOutcome);
      if (!nextEdge) {
        if (lastOutcome.status === 'FAIL') {
          throw new Error(`Stage ${lastNode.id} failed with no outgoing fail edge`);
        }
        return lastOutcome;
      }

      return await this.executeFrom(nextEdge.to, lastOutcome, nextEdge, signal);
    } catch (error) {
      if (error instanceof ExecutionCancelledError) {
        return {
          status: 'SKIPPED',
          context_updates: {},
          notes: CANCEL_MESSAGE,
        };
      }
      throw error;
    }
  }

  /**
   * Initialize the execution context and validate the graph
   */
  private async initialize(): Promise<void> {
    // Ensure logs directory exists
    await mkdir(this.config.logs_root, { recursive: true });
    this.completedNodes = [];
    this.nodeOutcomes = new Map();
    this.nodeRetries = new Map();
    this.logs = [];
    this.runSegmentIndex = 0;
    this.restartCount = 0;
    this.maxRestarts = this.resolveMaxRestarts();
    this.runSegments = [];
    this.activeLogsRoot = this.config.logs_root;
    this.runStartedAtMs = Date.now();
    this.runBudgetLimits = this.parseBudgetLimits(this.graph.attributes);
    this.runBudgetTotals = {
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: 0,
    };
    this.budgetNodeSummaries = {};
    
    // Mirror graph attributes into context
    await this.context.set('graph.goal', this.graph.goal || '');
    await this.context.set('graph.label', this.graph.label || '');
    await this.context.set('graph.id', this.graph.id);
    await this.context.set('config.llm_backend', this.config.llm_backend || '');
    await this.context.set('config.default_provider', this.config.default_provider || '');
    await this.context.set('config.llm_provider', this.config.llm_provider || '');
    await this.context.set('config.llm_model', this.config.llm_model || '');
    await this.context.set('config.providers', this.config.providers || {});
    await this.context.set('budget.run.limit_tokens', this.runBudgetLimits.max_tokens ?? null);
    await this.context.set('budget.run.limit_cost_usd', this.runBudgetLimits.max_cost_usd ?? null);
    await this.context.set('budget.run.limit_duration_ms', this.runBudgetLimits.max_duration_ms ?? null);
    await this.context.set('run.segment_index', this.runSegmentIndex);
    await this.context.set('run.segment_logs_root', this.activeLogsRoot);
    await this.context.set('run.restart_count', this.restartCount);
    await this.context.set('run.max_restarts', this.maxRestarts);
    this.runSegments.push({
      segment_index: this.runSegmentIndex,
      logs_root: this.activeLogsRoot,
      started_at: new Date().toISOString(),
      restart: false,
    });
    await this.writeRunSegmentsArtifact();
    if (this.hasAnyBudgetLimit(this.runBudgetLimits)) {
      await this.writeRunBudgetArtifact();
    }
    
    this.emit('event', {
      type: 'RUN_START',
      timestamp: new Date(),
      data: {
        graph: this.graph.id,
        segment_index: this.runSegmentIndex,
        logs_root: this.activeLogsRoot,
        restart: false,
      },
    } as ExecutionEvent);
  }

  /**
   * Execute the graph traversal
   */
  private async execute(signal?: AbortSignal): Promise<Outcome> {
    return this.executeFrom(this.findStartNode().id, null, null, signal);
  }

  /**
   * Execute the graph traversal from a specific node
   */
  private async executeFrom(
    startNodeId: string,
    lastOutcome: Outcome | null = null,
    incomingEdge: Edge | null = null,
    signal?: AbortSignal
  ): Promise<Outcome> {
    let currentNodeId = startNodeId;

    while (true) {
      this.assertNotCancelled(signal);
      const node = this.graph.nodes.get(currentNodeId);
      if (!node) {
        throw new Error(`Node not found: ${currentNodeId}`);
      }

      // Update current node in context
      await this.context.set('current_node', node.id);

      // Resolve fidelity for this node
      const fidelity = this.resolveFidelity(incomingEdge, node);
      await this.context.set('fidelity', fidelity);
      const threadId = this.resolveThreadId(incomingEdge, node, fidelity);
      if (threadId) {
        await this.context.set('thread_id', threadId);
      }

      // Check for terminal node
      if (this.isTerminal(node)) {
        const gateResult = this.checkGoalGates();
        if (!gateResult.ok && gateResult.failedGate) {
          const retryTarget = this.getRetryTarget(gateResult.failedGate);
          if (retryTarget) {
            currentNodeId = retryTarget;
            incomingEdge = null;
            continue;
          }
          throw new Error('Goal gate unsatisfied and no retry target');
        }
        break;
      }

      // Execute node with retry policy
      const retryPolicy = this.buildRetryPolicy(node);
      const nodeStartedAtMs = Date.now();
      const rawOutcome = await this.executeWithRetry(node, retryPolicy, signal);
      const routedOutcome = this.applyTargetedRetryRouting(node, rawOutcome);
      const budgetEvaluation = await this.applyBudgetControls(
        node,
        routedOutcome,
        Date.now() - nodeStartedAtMs
      );
      const outcome = budgetEvaluation.outcome;
      lastOutcome = outcome;

      // Record completion
      this.completedNodes.push(node.id);
      this.nodeOutcomes.set(node.id, outcome);
      await this.context.set('completed_nodes', [...this.completedNodes]);

      // Apply context updates
      await this.context.apply_updates(outcome.context_updates);
      await this.context.set('outcome', outcome.status);
      if (outcome.preferred_label) {
        await this.context.set('preferred_label', outcome.preferred_label);
      }

      // Save checkpoint
      await this.saveCheckpoint(node.id);
      if (budgetEvaluation.breached) {
        return outcome;
      }

      // Select next edge
      const nextEdge = this.selectEdge(node, outcome);
      if (!nextEdge) {
        if (outcome.status === 'FAIL') {
          throw new Error(`Stage ${node.id} failed with no outgoing fail edge`);
        }
        break;
      }

      this.emit('event', {
        type: 'EDGE_SELECT',
        timestamp: new Date(),
        data: {
          from: node.id,
          to: nextEdge.to,
          label: nextEdge.label,
          condition: nextEdge.condition,
          weight: nextEdge.weight,
        },
      } as ExecutionEvent);

      // Handle loop restart
      if (nextEdge.loop_restart) {
        await this.beginLoopRestart(node.id, nextEdge);
        currentNodeId = nextEdge.to;
        incomingEdge = nextEdge;
        continue;
      }

      // Advance to next node
      currentNodeId = nextEdge.to;
      incomingEdge = nextEdge;
    }

    return lastOutcome || { status: 'SUCCESS', context_updates: {} };
  }

  /**
   * Finalize the execution and cleanup
   */
  private async finalize(outcome: Outcome): Promise<void> {
    this.emit('event', {
      type: 'RUN_COMPLETE',
      timestamp: new Date(),
      data: { outcome },
    } as ExecutionEvent);
  }

  /**
   * Find the start node (shape=Mdiamond/circle, type=start, or id=start)
   */
  private findStartNode(): Node {
    // First, look for explicit start shape or type
    for (const [, node] of this.graph.nodes) {
      if (node.shape === 'Mdiamond' || node.shape === 'circle' || node.type === 'start') {
        return node;
      }
    }

    // Fallback to id="start" or "Start"
    for (const [id, node] of this.graph.nodes) {
      if (id.toLowerCase() === 'start') {
        return node;
      }
    }

    throw new Error('No start node found (shape=Mdiamond/circle, type=start, or id="start")');
  }

  /**
   * Check if a node is terminal (exit node)
   */
  private isTerminal(node: Node): boolean {
    return node.shape === 'Msquare' || node.shape === 'doublecircle' || node.type === 'exit';
  }

  /**
   * Check goal gates before allowing exit
   */
  private checkGoalGates(): { ok: boolean; failedGate?: Node } {
    for (const [nodeId, outcome] of this.nodeOutcomes) {
      const node = this.graph.nodes.get(nodeId);
      if (node?.goal_gate) {
        if (outcome.status !== 'SUCCESS' && outcome.status !== 'PARTIAL_SUCCESS') {
          return { ok: false, failedGate: node };
        }
      }
    }
    return { ok: true };
  }

  /**
   * Get retry target for a failed goal gate
   */
  private getRetryTarget(node: Node): string | null {
    if (node.retry_target && this.graph.nodes.has(node.retry_target)) {
      return node.retry_target;
    }
    if (node.fallback_retry_target && this.graph.nodes.has(node.fallback_retry_target)) {
      return node.fallback_retry_target;
    }
    if (this.graph.retry_target && this.graph.nodes.has(this.graph.retry_target)) {
      return this.graph.retry_target;
    }
    if (this.graph.fallback_retry_target && this.graph.nodes.has(this.graph.fallback_retry_target)) {
      return this.graph.fallback_retry_target;
    }
    return null;
  }

  /**
   * Build retry policy for a node
   */
  private buildRetryPolicy(node: Node): RetryPolicy {
    const retryPolicyType = this.parseRetryPolicyType(node.attributes.retry_policy);
    const maxAttempts =
      retryPolicyType === 'none' || retryPolicyType === 'targeted'
        ? 1
        : node.max_retries + 1;
    
    return {
      max_attempts: maxAttempts,
      backoff: DEFAULT_BACKOFF_CONFIG,
      should_retry: (error) =>
        retryPolicyType === 'standard' && this.isRetryableError(error),
    };
  }

  /**
   * Execute a node with retry logic
   */
  private async executeWithRetry(node: Node, policy: RetryPolicy, signal?: AbortSignal): Promise<Outcome> {
    const retryCount = this.nodeRetries.get(node.id) || 0;

    for (let attempt = 1; attempt <= policy.max_attempts; attempt++) {
      this.assertNotCancelled(signal);
      this.emit('event', {
        type: 'NODE_START',
        timestamp: new Date(),
        data: { node: node.id, attempt },
      } as ExecutionEvent);

      try {
        const handler = this.handlerRegistry.resolve(node);
        const outcome = await handler.execute(
          node,
          this.context,
          this.graph,
          this.activeLogsRoot,
          signal
        );

        this.emit('event', {
          type: 'NODE_COMPLETE',
          timestamp: new Date(),
          data: { node: node.id, outcome },
        } as ExecutionEvent);

        // Record execution for loop detection and check for patterns
        this.loopDetector.record(
          node.id,
          node.type,
          node.prompt || '',
          outcome.status
        );
        const loopCheck = this.loopDetector.check();
        if (loopCheck.detected) {
          // Inject steering message to warn about loop
          await this.context.steer(loopCheck.message, 'loop_detection');
          this.emit('event', {
            type: 'LOOP_DETECTED',
            timestamp: new Date(),
            data: { 
              node: node.id, 
              pattern: loopCheck.pattern,
              message: loopCheck.message,
            },
          } as ExecutionEvent);
        }

        if (outcome.status === 'SUCCESS' || outcome.status === 'PARTIAL_SUCCESS') {
          this.nodeRetries.set(node.id, 0);
          return outcome;
        }

        if (outcome.status === 'RETRY') {
          if (attempt < policy.max_attempts) {
            this.nodeRetries.set(node.id, retryCount + 1);
            this.emit('event', {
              type: 'NODE_RETRY',
              timestamp: new Date(),
              data: {
                node: node.id,
                attempt,
                max_attempts: policy.max_attempts,
                reason: 'retry_requested',
              },
            } as ExecutionEvent);
            await this.delay(this.calculateBackoff(attempt, policy.backoff));
            continue;
          }
          if (node.allow_partial) {
            return {
              ...outcome,
              status: 'PARTIAL_SUCCESS',
              notes: 'retries exhausted, partial accepted',
            };
          }
        }

        if (outcome.status === 'FAIL') {
          return outcome;
        }

        return outcome;
      } catch (error) {
        if (error instanceof ExecutionCancelledError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        this.emit('event', {
          type: 'NODE_FAIL',
          timestamp: new Date(),
          data: { node: node.id, error: errorMessage },
        } as ExecutionEvent);

        // Record failure for loop detection
        this.loopDetector.record(
          node.id,
          node.type,
          node.prompt || '',
          'FAIL'
        );
        const loopCheck = this.loopDetector.check();
        if (loopCheck.detected) {
          await this.context.steer(loopCheck.message, 'loop_detection');
          this.emit('event', {
            type: 'LOOP_DETECTED',
            timestamp: new Date(),
            data: { 
              node: node.id, 
              pattern: loopCheck.pattern,
              message: loopCheck.message,
            },
          } as ExecutionEvent);
        }

        if (attempt < policy.max_attempts && policy.should_retry(error as Error)) {
          this.nodeRetries.set(node.id, retryCount + 1);
          this.emit('event', {
            type: 'NODE_RETRY',
            timestamp: new Date(),
            data: {
              node: node.id,
              attempt,
              max_attempts: policy.max_attempts,
              reason: errorMessage,
            },
          } as ExecutionEvent);
          await this.delay(this.calculateBackoff(attempt, policy.backoff));
          continue;
        }

        return {
          status: 'FAIL',
          failure_reason: errorMessage,
          context_updates: {},
        };
      }
    }

    return {
      status: 'FAIL',
      failure_reason: 'Max retries exceeded',
      context_updates: {},
    };
  }

  /**
   * Select the next edge based on outcome and context
   */
  private selectEdge(node: Node, outcome: Outcome): Edge | null {
    const outgoingEdges = this.graph.edges.filter(e => e.from === node.id);
    
    if (outgoingEdges.length === 0) {
      return null;
    }

    // Step 1: Condition matching
    const contextSnapshot = this.context.snapshot();
    const conditionMatched = outgoingEdges.filter(edge => {
      if (!edge.condition) return false;
      return evaluateCondition(edge.condition, outcome, contextSnapshot);
    });
    
    if (conditionMatched.length > 0) {
      return this.bestByWeightThenLexical(conditionMatched);
    }

    // Step 2: Preferred label match
    if (outcome.preferred_label) {
      const normalizedPreferred = this.normalizeLabel(outcome.preferred_label);
      for (const edge of outgoingEdges) {
        if (edge.label && this.normalizeLabel(edge.label) === normalizedPreferred) {
          return edge;
        }
      }
    }

    // Step 3: Suggested next IDs
    if (outcome.suggested_next_ids) {
      for (const suggestedId of outcome.suggested_next_ids) {
        const edge = outgoingEdges.find(e => e.to === suggestedId);
        if (edge) return edge;
      }
    }

    // Step 4 & 5: Weight with lexical tiebreak (unconditional edges only)
    const unconditional = outgoingEdges.filter(e => !e.condition);
    if (unconditional.length > 0) {
      return this.bestByWeightThenLexical(unconditional);
    }

    // Fallback: any edge
    return this.bestByWeightThenLexical(outgoingEdges);
  }

  /**
   * Select best edge by weight (descending) then target ID (ascending)
   */
  private bestByWeightThenLexical(edges: Edge[]): Edge {
    return edges.sort((a, b) => {
      if (b.weight !== a.weight) {
        return b.weight - a.weight;
      }
      return a.to.localeCompare(b.to);
    })[0];
  }

  /**
   * Normalize a label for comparison
   */
  private normalizeLabel(label: string): string {
    return label
      .toLowerCase()
      .trim()
      .replace(/^\[[a-z]\]\s*/i, '')  // Remove [K] prefix
      .replace(/^[a-z]\)\s*/i, '')     // Remove K) prefix
      .replace(/^[a-z]\s+-\s+/i, '');  // Remove K - prefix
  }

  /**
   * Resolve fidelity for a node based on edge > node > graph default > compact.
   */
  private resolveFidelity(edge: Edge | null, node: Node): string {
    const edgeFidelity = edge?.fidelity?.trim();
    if (edgeFidelity) return edgeFidelity;
    const nodeFidelity = node.fidelity?.trim();
    if (nodeFidelity) return nodeFidelity;
    const graphFidelity = this.graph.default_fidelity?.trim();
    return graphFidelity || 'compact';
  }

  /**
   * Resolve thread id when fidelity is full
   */
  private resolveThreadId(edge: Edge | null, node: Node, fidelity: string): string | null {
    const threadId = edge?.thread_id || node.thread_id;
    if (threadId) return threadId;
    if (fidelity === 'full') {
      return node.id;
    }
    return null;
  }

  /**
   * Save checkpoint to disk
   */
  private async saveCheckpoint(currentNodeId: string): Promise<void> {
    const checkpoint = {
      timestamp: new Date(),
      current_node: currentNodeId,
      completed_nodes: [...this.completedNodes],
      node_retries: Object.fromEntries(this.nodeRetries),
      context_values: this.context.snapshot(),
      logs: [...this.logs],
      node_outcomes: Object.fromEntries(this.nodeOutcomes),
    };
    
    await this.checkpointManager.save(checkpoint);
    
    this.emit('event', {
      type: 'CHECKPOINT_SAVE',
      timestamp: new Date(),
      data: { node: currentNodeId },
    } as ExecutionEvent);
  }

  private async beginLoopRestart(fromNodeId: string, nextEdge: Edge): Promise<void> {
    if (this.restartCount >= this.maxRestarts) {
      throw new Error(
        `Max loop restarts exceeded (${this.maxRestarts}) at edge ${fromNodeId} -> ${nextEdge.to}`
      );
    }

    this.emit('event', {
      type: 'RUN_COMPLETE',
      timestamp: new Date(),
      data: {
        graph: this.graph.id,
        restart: true,
        segment_index: this.runSegmentIndex,
        restarted_from: fromNodeId,
        target: nextEdge.to,
      },
    } as ExecutionEvent);

    this.restartCount += 1;
    this.runSegmentIndex += 1;
    this.context = this.context.clone();
    this.completedNodes = [];
    this.nodeOutcomes = new Map();
    this.nodeRetries = new Map();
    this.logs = [];

    const segmentLogsRoot = join(
      this.config.logs_root,
      `restart-${String(this.runSegmentIndex).padStart(3, '0')}`
    );
    await mkdir(segmentLogsRoot, { recursive: true });
    this.activeLogsRoot = segmentLogsRoot;
    this.runStartedAtMs = Date.now();
    this.runBudgetTotals = {
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: 0,
    };
    this.budgetNodeSummaries = {};

    await this.context.set('run.segment_index', this.runSegmentIndex);
    await this.context.set('run.segment_logs_root', this.activeLogsRoot);
    await this.context.set('run.restart_count', this.restartCount);
    await this.context.set('run.restarted_from', fromNodeId);
    await this.context.set('run.restart_target', nextEdge.to);
    this.runSegments.push({
      segment_index: this.runSegmentIndex,
      logs_root: this.activeLogsRoot,
      started_at: new Date().toISOString(),
      restart: true,
      restarted_from: fromNodeId,
      target: nextEdge.to,
    });
    await this.writeRunSegmentsArtifact();
    if (this.hasAnyBudgetLimit(this.runBudgetLimits)) {
      await this.writeRunBudgetArtifact();
    }

    this.emit('event', {
      type: 'RUN_START',
      timestamp: new Date(),
      data: {
        graph: this.graph.id,
        restart: true,
        segment_index: this.runSegmentIndex,
        restarted_from: fromNodeId,
        target: nextEdge.to,
        logs_root: this.activeLogsRoot,
      },
    } as ExecutionEvent);
  }

  private resolveMaxRestarts(): number {
    if (typeof this.config.max_restarts === 'number' && Number.isFinite(this.config.max_restarts)) {
      return Math.max(0, Math.floor(this.config.max_restarts));
    }
    return 50;
  }

  private async restoreSegmentStateFromContext(): Promise<void> {
    const segmentLogsRoot = await this.context.getString('run.segment_logs_root', this.config.logs_root);
    const segmentIndex = await this.context.get('run.segment_index', 0);
    const restartCount = await this.context.get('run.restart_count', 0);
    const maxRestarts = await this.context.get('run.max_restarts', this.maxRestarts || this.resolveMaxRestarts());
    this.activeLogsRoot = segmentLogsRoot || this.config.logs_root;
    this.runSegmentIndex = this.parseNonNegativeInteger(segmentIndex, 0);
    this.restartCount = this.parseNonNegativeInteger(restartCount, this.runSegmentIndex);
    this.maxRestarts = this.parseNonNegativeInteger(maxRestarts, this.resolveMaxRestarts());
    await mkdir(this.activeLogsRoot, { recursive: true });
  }

  private parseNonNegativeInteger(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return Math.max(0, parsed);
      }
    }
    return Math.max(0, fallback);
  }

  private async writeRunSegmentsArtifact(): Promise<string> {
    const path = join(this.config.logs_root, 'run_segments.json');
    await this.writeJson(path, {
      graph_id: this.graph.id,
      segments: this.runSegments,
      updated_at: new Date().toISOString(),
    });
    await this.context.set('run.segments.artifact_path', path);
    return path;
  }

  /**
   * Calculate backoff delay
   */
  private calculateBackoff(attempt: number, config: typeof DEFAULT_BACKOFF_CONFIG): number {
    let delay = config.initial_delay_ms * (config.backoff_factor ** (attempt - 1));
    delay = Math.min(delay, config.max_delay_ms);
    
    if (config.jitter) {
      // Add random jitter between 0.5x and 1.5x
      delay = delay * (0.5 + Math.random());
    }
    
    return delay;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Retryable errors
    if (message.includes('429')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('econnreset')) return true;
    if (message.includes('etimedout')) return true;
    if (message.includes('econnrefused')) return true;
    if (message.includes('5') && message.includes('error')) return true;
    
    // Non-retryable errors
    if (message.includes('401')) return false;
    if (message.includes('403')) return false;
    if (message.includes('400')) return false;
    
    return false;
  }

  private parseRetryPolicyType(value: unknown): RetryPolicyType {
    if (typeof value !== 'string') {
      return 'standard';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'none' || normalized === 'standard' || normalized === 'targeted') {
      return normalized;
    }
    return 'standard';
  }

  private applyTargetedRetryRouting(node: Node, outcome: Outcome): Outcome {
    if (outcome.status !== 'FAIL') {
      return outcome;
    }

    const retryPolicyType = this.parseRetryPolicyType(node.attributes.retry_policy);
    if (retryPolicyType !== 'targeted') {
      return outcome;
    }

    const contextSnapshot = this.context.snapshot();
    const failureClass = this.resolveFailureClass(node, outcome, contextSnapshot);
    const retryTarget = this.resolveTargetedRetryTarget(node, failureClass);
    const updates: Record<string, unknown> = {
      ...outcome.context_updates,
      [`retry.${node.id}.policy`]: 'targeted',
      [`retry.${node.id}.class`]: failureClass ?? '',
      [`retry.${node.id}.target`]: retryTarget ?? '',
    };
    if (failureClass) {
      updates['retry.class'] = failureClass;
      updates['failure.class'] = failureClass;
    }

    if (!retryTarget) {
      return {
        ...outcome,
        context_updates: updates,
        notes: this.appendOutcomeNote(
          outcome.notes,
          `targeted retry class=${failureClass ?? 'unknown'} no retry target configured`
        ),
      };
    }

    return {
      ...outcome,
      preferred_label: 'retry',
      suggested_next_ids: [retryTarget],
      context_updates: updates,
      notes: this.appendOutcomeNote(
        outcome.notes,
        `targeted retry class=${failureClass ?? 'unknown'} target=${retryTarget}`
      ),
    };
  }

  private resolveFailureClass(
    node: Node,
    outcome: Outcome,
    contextSnapshot: Record<string, unknown>
  ): FailureClass | null {
    const candidateKeys = [
      `failure.${node.id}.class`,
      'failure.class',
      `retry.${node.id}.class`,
      'retry.class',
      `failure.analyze.${node.id}.class`,
    ];

    for (const key of candidateKeys) {
      const fromOutcome = this.normalizeFailureClass(outcome.context_updates[key]);
      if (fromOutcome) {
        return fromOutcome;
      }
      const fromContext = this.normalizeFailureClass(contextSnapshot[key]);
      if (fromContext) {
        return fromContext;
      }
    }

    return this.classifyFailureReason(outcome.failure_reason);
  }

  private normalizeFailureClass(value: unknown): FailureClass | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'transient' ||
      normalized === 'quality_gap' ||
      normalized === 'tool_error' ||
      normalized === 'spec_mismatch'
    ) {
      return normalized;
    }
    return null;
  }

  private classifyFailureReason(failureReason?: string): FailureClass | null {
    if (!failureReason) {
      return null;
    }
    const message = failureReason.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('transient')
    ) {
      return 'transient';
    }
    if (
      message.includes('lint') ||
      message.includes('typecheck') ||
      message.includes('test') ||
      message.includes('assert') ||
      message.includes('quality')
    ) {
      return 'quality_gap';
    }
    if (
      message.includes('command not found') ||
      message.includes('spawn') ||
      message.includes('enoent') ||
      message.includes('eacces') ||
      message.includes('tool')
    ) {
      return 'tool_error';
    }
    if (
      message.includes('schema') ||
      message.includes('contract') ||
      message.includes('spec') ||
      message.includes('mismatch')
    ) {
      return 'spec_mismatch';
    }
    return 'spec_mismatch';
  }

  private resolveTargetedRetryTarget(
    node: Node,
    failureClass: FailureClass | null
  ): string | null {
    const targets = this.parseTargetedRetryTargets(node);
    const mappedTarget = failureClass ? targets[failureClass] : undefined;
    if (mappedTarget && this.graph.nodes.has(mappedTarget)) {
      return mappedTarget;
    }

    const genericRetry = this.getRetryTarget(node);
    if (genericRetry && this.graph.nodes.has(genericRetry)) {
      return genericRetry;
    }
    return null;
  }

  private parseTargetedRetryTargets(node: Node): Partial<Record<FailureClass, string>> {
    const directTargets: Partial<Record<FailureClass, string>> = {
      transient: this.asTargetNode(node.attributes.retry_target_transient),
      quality_gap: this.asTargetNode(node.attributes.retry_target_quality_gap),
      tool_error: this.asTargetNode(node.attributes.retry_target_tool_error),
      spec_mismatch: this.asTargetNode(node.attributes.retry_target_spec_mismatch),
    };

    const rawMap = node.attributes.retry_target_map;
    const parsedMap = this.parseRetryTargetMap(rawMap);
    return {
      ...directTargets,
      ...parsedMap,
    };
  }

  private parseRetryTargetMap(value: unknown): Partial<Record<FailureClass, string>> {
    if (value === undefined || value === null) {
      return {};
    }
    let parsed: unknown = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return {};
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const output: Partial<Record<FailureClass, string>> = {};
    const entries = parsed as Record<string, unknown>;
    for (const key of ['transient', 'quality_gap', 'tool_error', 'spec_mismatch'] as const) {
      const target = this.asTargetNode(entries[key]);
      if (target) {
        output[key] = target;
      }
    }
    return output;
  }

  private asTargetNode(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private appendOutcomeNote(existing: string | undefined, note: string): string {
    if (!existing) {
      return note;
    }
    return `${existing}; ${note}`;
  }

  private async applyBudgetControls(
    node: Node,
    outcome: Outcome,
    nodeDurationMs: number
  ): Promise<BudgetEvaluationResult> {
    const nodeLimits = this.parseNodeBudgetLimits(node);
    const budgetConfigured = this.hasAnyBudgetLimit(this.runBudgetLimits) || this.hasAnyBudgetLimit(nodeLimits);
    if (!budgetConfigured) {
      return {
        outcome,
        breached: false,
      };
    }

    const nodeUsage = this.extractNodeBudgetUsage(node, outcome, nodeDurationMs);
    this.runBudgetTotals.tokens_used += nodeUsage.tokens_used;
    this.runBudgetTotals.cost_usd += nodeUsage.cost_usd;
    this.runBudgetTotals.duration_ms = Math.max(0, Date.now() - this.runStartedAtMs);

    const errors: string[] = [];
    this.collectBudgetLimitError(
      errors,
      'node',
      'budget_max_tokens',
      nodeUsage.tokens_used,
      nodeLimits.max_tokens
    );
    this.collectBudgetLimitError(
      errors,
      'node',
      'budget_max_cost_usd',
      nodeUsage.cost_usd,
      nodeLimits.max_cost_usd
    );
    this.collectBudgetLimitError(
      errors,
      'node',
      'timeout',
      nodeUsage.duration_ms,
      nodeLimits.max_duration_ms
    );
    this.collectBudgetLimitError(
      errors,
      'graph',
      'budget_max_tokens',
      this.runBudgetTotals.tokens_used,
      this.runBudgetLimits.max_tokens
    );
    this.collectBudgetLimitError(
      errors,
      'graph',
      'budget_max_cost_usd',
      this.runBudgetTotals.cost_usd,
      this.runBudgetLimits.max_cost_usd
    );
    this.collectBudgetLimitError(
      errors,
      'graph',
      'budget_max_duration_ms',
      this.runBudgetTotals.duration_ms,
      this.runBudgetLimits.max_duration_ms
    );

    const breached = errors.length > 0;
    const stageDir = join(this.activeLogsRoot, node.id);
    await mkdir(stageDir, { recursive: true });
    const nodeArtifactPath = join(stageDir, 'budget_result.json');
    const nodeSummary: BudgetNodeSummary = {
      node_id: node.id,
      limits: nodeLimits,
      usage: nodeUsage,
      run_totals: { ...this.runBudgetTotals },
      run_limits: this.runBudgetLimits,
      breached,
      errors,
      timestamp: new Date().toISOString(),
    };
    this.budgetNodeSummaries[node.id] = nodeSummary;
    await this.writeJson(nodeArtifactPath, nodeSummary);
    const runArtifactPath = await this.writeRunBudgetArtifact();

    const budgetUpdates: Record<string, unknown> = {
      [`budget.${node.id}.tokens_used`]: nodeUsage.tokens_used,
      [`budget.${node.id}.cost_usd`]: nodeUsage.cost_usd,
      [`budget.${node.id}.duration_ms`]: nodeUsage.duration_ms,
      [`budget.${node.id}.limit_tokens`]: nodeLimits.max_tokens ?? null,
      [`budget.${node.id}.limit_cost_usd`]: nodeLimits.max_cost_usd ?? null,
      [`budget.${node.id}.limit_duration_ms`]: nodeLimits.max_duration_ms ?? null,
      [`budget.${node.id}.breached`]: breached,
      [`budget.${node.id}.errors`]: errors,
      [`budget.${node.id}.result_path`]: nodeArtifactPath,
      'budget.run.tokens_used_total': this.runBudgetTotals.tokens_used,
      'budget.run.cost_usd_total': this.runBudgetTotals.cost_usd,
      'budget.run.duration_ms_total': this.runBudgetTotals.duration_ms,
      'budget.run.breached': breached,
      'budget.run.errors': errors,
      'budget.run.artifact_path': runArtifactPath,
    };

    const mergedOutcome: Outcome = {
      ...outcome,
      context_updates: {
        ...outcome.context_updates,
        ...budgetUpdates,
      },
    };

    if (!breached) {
      return {
        outcome: mergedOutcome,
        breached: false,
      };
    }

    const budgetFailure = `Budget limits exceeded at node "${node.id}": ${errors.join('; ')}`;
    return {
      outcome: {
        ...mergedOutcome,
        status: 'FAIL',
        failure_reason: mergedOutcome.failure_reason
          ? `${mergedOutcome.failure_reason}; ${budgetFailure}`
          : budgetFailure,
        notes: this.appendOutcomeNote(mergedOutcome.notes, 'budget breach'),
      },
      breached: true,
    };
  }

  private collectBudgetLimitError(
    errors: string[],
    scope: 'graph' | 'node',
    name: string,
    actual: number,
    limit: number | undefined
  ): void {
    if (limit === undefined) {
      return;
    }
    if (actual > limit) {
      errors.push(`${scope}.${name} exceeded (${actual} > ${limit})`);
    }
  }

  private parseBudgetLimits(attributes: Record<string, unknown>): BudgetLimits {
    return {
      max_tokens: this.asPositiveNumber(attributes.budget_max_tokens),
      max_cost_usd: this.asPositiveNumber(attributes.budget_max_cost_usd),
      max_duration_ms: this.asPositiveNumber(attributes.budget_max_duration_ms),
    };
  }

  private parseNodeBudgetLimits(node: Node): BudgetLimits {
    return {
      max_tokens: this.asPositiveNumber(node.attributes.budget_max_tokens),
      max_cost_usd: this.asPositiveNumber(node.attributes.budget_max_cost_usd),
      max_duration_ms: this.asPositiveNumber(node.timeout ?? node.attributes.timeout),
    };
  }

  private hasAnyBudgetLimit(limits: BudgetLimits): boolean {
    return (
      limits.max_tokens !== undefined ||
      limits.max_cost_usd !== undefined ||
      limits.max_duration_ms !== undefined
    );
  }

  private extractNodeBudgetUsage(node: Node, outcome: Outcome, nodeDurationMs: number): BudgetUsageTotals {
    const tokensUsed = this.readNumericContextValue(outcome.context_updates, [
      `budget.${node.id}.tokens_used`,
      'budget.tokens_used',
      `codergen.${node.id}.usage.total_tokens`,
      `codergen.${node.id}.usage.totalTokens`,
      `codergen.${node.id}.usage.tokens`,
    ]);

    const costUsd = this.readNumericContextValue(outcome.context_updates, [
      `budget.${node.id}.cost_usd`,
      'budget.cost_usd',
      `codergen.${node.id}.usage.cost_usd`,
      `codergen.${node.id}.usage.costUsd`,
      `codergen.${node.id}.usage.total_cost_usd`,
      `codergen.${node.id}.usage.totalCostUsd`,
    ]);

    return {
      tokens_used: Math.max(0, tokensUsed ?? 0),
      cost_usd: Math.max(0, costUsd ?? 0),
      duration_ms: Math.max(0, Math.round(nodeDurationMs)),
    };
  }

  private readNumericContextValue(
    contextUpdates: Record<string, unknown>,
    keys: string[]
  ): number | undefined {
    for (const key of keys) {
      const parsed = this.asFiniteNumber(contextUpdates[key]);
      if (parsed !== undefined) {
        return parsed;
      }
    }
    return undefined;
  }

  private asPositiveNumber(value: unknown): number | undefined {
    const parsed = this.asFiniteNumber(value);
    if (parsed === undefined || parsed <= 0) {
      return undefined;
    }
    return parsed;
  }

  private asFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private async writeRunBudgetArtifact(): Promise<string> {
    const path = join(this.activeLogsRoot, 'budget_usage.json');
    const nodeSummaries = Object.values(this.budgetNodeSummaries);
    await this.writeJson(path, {
      graph_id: this.graph.id,
      limits: this.runBudgetLimits,
      totals: this.runBudgetTotals,
      breached: nodeSummaries.some(summary => summary.breached),
      errors: nodeSummaries.flatMap(summary => summary.errors),
      nodes: this.budgetNodeSummaries,
      updated_at: new Date().toISOString(),
    });
    return path;
  }

  private async writeJson(path: string, payload: unknown): Promise<void> {
    await writeFile(path, JSON.stringify(payload, null, 2));
  }

  /**
   * Delay for a given number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private assertNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new ExecutionCancelledError();
    }
  }
}

export default ExecutionEngine;

export class ExecutionCancelledError extends Error {
  constructor() {
    super(CANCEL_MESSAGE);
    this.name = 'ExecutionCancelledError';
  }
}
