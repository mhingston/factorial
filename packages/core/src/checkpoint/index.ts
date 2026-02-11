import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Checkpoint, Outcome } from '../types/index.js';
import { Context } from '../context/index.js';

/**
 * Checkpoint manager for saving and loading execution state
 */
export class CheckpointManager {
  private logsRoot: string;

  constructor(logsRoot: string) {
    this.logsRoot = logsRoot;
  }

  /**
   * Save a checkpoint to disk
   */
  async save(checkpoint: Checkpoint): Promise<string> {
    const checkpointPath = `${this.logsRoot}/checkpoint.json`;
    
    // Ensure directory exists
    await mkdir(dirname(checkpointPath), { recursive: true });
    
    const data = {
      timestamp: checkpoint.timestamp.toISOString(),
      current_node: checkpoint.current_node,
      completed_nodes: checkpoint.completed_nodes,
      node_retries: checkpoint.node_retries,
      context: checkpoint.context_values,
      node_outcomes: checkpoint.node_outcomes || {},
      logs: checkpoint.logs,
    };
    
    await writeFile(checkpointPath, JSON.stringify(data, null, 2));
    return checkpointPath;
  }

  /**
   * Load a checkpoint from disk
   */
  async load(path: string): Promise<Checkpoint> {
    const data = JSON.parse(await readFile(path, 'utf-8'));
    
    return {
      timestamp: new Date(data.timestamp),
      current_node: data.current_node,
      completed_nodes: data.completed_nodes,
      node_retries: data.node_retries,
      context_values: data.context,
      node_outcomes: data.node_outcomes || {},
      logs: data.logs,
    };
  }

  /**
   * Load the latest checkpoint from the logs root
   */
  async loadLatest(): Promise<Checkpoint | null> {
    try {
      return await this.load(`${this.logsRoot}/checkpoint.json`);
    } catch {
      return null;
    }
  }

  /**
   * Create a checkpoint from current execution state
   */
  static create(
    context: Context,
    currentNode: string,
    completedNodes: string[],
    nodeRetries: Record<string, number>,
    logs: string[],
    nodeOutcomes: Record<string, Outcome> = {}
  ): Checkpoint {
    return {
      timestamp: new Date(),
      current_node: currentNode,
      completed_nodes: [...completedNodes],
      node_retries: { ...nodeRetries },
      context_values: context.snapshot(),
      node_outcomes: { ...nodeOutcomes },
      logs: [...logs],
    };
  }

  /**
   * Restore context from a checkpoint
   */
  static restoreContext(checkpoint: Checkpoint): Context {
    return Context.fromSnapshot(checkpoint.context_values);
  }
}

export default CheckpointManager;
