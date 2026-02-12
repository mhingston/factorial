/**
 * Parallel Execution Support
 * Enables spawning and managing multiple subagents in parallel
 */

import type { LightweightSubagent, SubagentResult } from './lightweight-agent.js';
import { SubagentRegistry, subagentRegistry } from './registry.js';
import { toModelOutput } from './tools.js';

export interface ParallelTask {
  id: string;
  task: string;
  model?: string;
  tools?: string[];
}

export interface ParallelResult {
  id: string;
  result: SubagentResult;
}

export interface ParallelExecutionOptions {
  maxConcurrent?: number;
  timeoutMs?: number;
  parentId?: string;
}

/**
 * Execute multiple subagents in parallel
 */
export async function executeParallelSubagents(
  tasks: ParallelTask[],
  createAgent: (task: ParallelTask) => LightweightSubagent,
  options: ParallelExecutionOptions = {}
): Promise<ParallelResult[]> {
  const { maxConcurrent = Infinity, timeoutMs = 300000 } = options;

  if (tasks.length === 0) {
    return [];
  }

  // Limit concurrent execution if specified
  if (maxConcurrent < tasks.length) {
    return executeWithConcurrencyLimit(tasks, createAgent, maxConcurrent, timeoutMs);
  }

  // Spawn all agents
  const agents = tasks.map(task => ({
    id: task.id,
    agent: createAgent(task),
    promise: null as Promise<SubagentResult> | null
  }));

  // Start all executions in parallel
  agents.forEach(a => {
    a.promise = a.agent.execute(a.id);
  });

  // Wait for all to complete with timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Parallel execution timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const results = await Promise.race([
    Promise.all(
      agents.map(async a => ({
        id: a.id,
        result: await a.promise!
      }))
    ),
    timeoutPromise
  ]);

  return results;
}

/**
 * Execute with concurrency limit
 */
async function executeWithConcurrencyLimit(
  tasks: ParallelTask[],
  createAgent: (task: ParallelTask) => LightweightSubagent,
  maxConcurrent: number,
  timeoutMs: number
): Promise<ParallelResult[]> {
  const results: ParallelResult[] = [];
  const executing: Promise<void>[] = [];

  const executeTask = async (task: ParallelTask): Promise<void> => {
    const agent = createAgent(task);
    const result = await agent.execute(task.task);
    results.push({ id: task.id, result });
  };

  const startTime = Date.now();

  for (const task of tasks) {
    if (Date.now() - startTime > timeoutMs) {
      // Timeout reached, mark remaining tasks as failed
      results.push({
        id: task.id,
        result: {
          output: 'Task skipped due to timeout',
          success: false,
          turnsUsed: 0,
          toolCalls: 0,
          tokenUsage: { input: 0, output: 0, total: 0 }
        }
      });
      continue;
    }

    const promise = executeTask(task).then(() => {
      executing.splice(executing.indexOf(promise), 1);
    });

    executing.push(promise);

    if (executing.length >= maxConcurrent) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Wait for multiple agents with early exit on failure
 */
export async function waitForAllAgents(
  agentIds: string[],
  registry: SubagentRegistry = subagentRegistry,
  options: { timeoutMs?: number; failFast?: boolean } = {}
): Promise<ParallelResult[]> {
  const { timeoutMs = 300000, failFast = false } = options;
  const startTime = Date.now();
  const results: ParallelResult[] = [];
  const pending = new Set(agentIds);

  while (pending.size > 0 && Date.now() - startTime < timeoutMs) {
    for (const agentId of Array.from(pending)) {
      const entry = registry.get(agentId);

      if (!entry) {
        results.push({
          id: agentId,
          result: {
            output: `Agent ${agentId} not found`,
            success: false,
            turnsUsed: 0,
            toolCalls: 0,
            tokenUsage: { input: 0, output: 0, total: 0 }
          }
        });
        pending.delete(agentId);
        continue;
      }

      if (entry.status !== 'running') {
        results.push({
          id: agentId,
          result: entry.result!
        });
        pending.delete(agentId);

        // Fail fast on first failure
        if (failFast && !entry.result!.success) {
          return results;
        }
      }
    }

    if (pending.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Mark any remaining pending agents as timeout
  for (const agentId of pending) {
    results.push({
      id: agentId,
      result: {
        output: `Timeout waiting for agent ${agentId}`,
        success: false,
        turnsUsed: 0,
        toolCalls: 0,
        tokenUsage: { input: 0, output: 0, total: 0 }
      }
    });
  }

  return results;
}

/**
 * Synthesize parallel results into a single summary
 */
export function synthesizeResults(results: ParallelResult[]): string {
  return results
    .map(r => {
      const status = r.result.success ? 'Success' : 'Failed';
      const summary = toModelOutput(r.result, 200);
      return `${r.id}: ${status} - ${summary}`;
    })
    .join('\n\n');
}

/**
 * Handler for parallel research/comparison patterns
 */
export class ParallelResearchHandler {
  private createAgent: (task: ParallelTask) => LightweightSubagent;

  constructor(
    createAgent: (task: ParallelTask) => LightweightSubagent,
    _registry: SubagentRegistry = subagentRegistry
  ) {
    this.createAgent = createAgent;
  }

  async execute(
    topics: string[],
    instructions: string = 'Research thoroughly and summarize findings.',
    model: string = 'gpt-4o-mini'
  ): Promise<{ summary: string; results: ParallelResult[] }> {
    const tasks = topics.map(topic => ({
      id: `research-${topic}`,
      task: `Research ${topic} in depth: ${instructions}`,
      model,
      tools: ['read_file', 'grep', 'glob']
    }));

    const results = await executeParallelSubagents(tasks, this.createAgent);

    // Synthesize results
    const synthesis = synthesizeResults(results);

    return {
      summary: synthesis,
      results
    };
  }
}

/**
 * Execute parallel map operation with subagents
 */
export async function parallelMap<T>(
  items: T[],
  mapFn: (item: T, index: number) => ParallelTask,
  createAgent: (task: ParallelTask) => LightweightSubagent,
  options: ParallelExecutionOptions = {}
): Promise<Array<{ item: T; index: number; result: SubagentResult }>> {
  const tasks = items.map((item, index) => ({
    ...mapFn(item, index),
    id: `map-${index}-${Date.now()}`
  }));

  const results = await executeParallelSubagents(tasks, createAgent, options);

  return results.map((r, i) => ({
    item: items[i],
    index: i,
    result: r.result
  }));
}
