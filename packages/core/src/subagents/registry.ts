/**
 * Subagent Registry
 * Tracks active agents and enforces depth limits
 */

import type { LightweightSubagent, SubagentResult } from './lightweight-agent.js';

export interface RegisteredSubagent {
  id: string;
  agent: LightweightSubagent;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  result?: SubagentResult;
  createdAt: Date;
  parentContext?: string;  // Track parent to enforce depth limits
}

export class SubagentRegistry {
  private agents: Map<string, RegisteredSubagent> = new Map();
  private maxDepth: number;

  constructor(maxDepth: number = 1) {
    this.maxDepth = maxDepth;
  }

  register(id: string, agent: LightweightSubagent, parentId?: string): void {
    // Check depth limit
    if (parentId) {
      const parentDepth = this.calculateDepth(parentId);
      const newDepth = parentDepth + 1;
      if (newDepth > this.maxDepth) {
        throw new Error(
          `Max subagent depth (${this.maxDepth}) exceeded. ` +
          `Cannot spawn subagent from ${parentId}.`
        );
      }
    }

    this.agents.set(id, {
      id,
      agent,
      status: 'running',
      createdAt: new Date(),
      parentContext: parentId
    });
  }

  complete(id: string, result: SubagentResult): void {
    const entry = this.agents.get(id);
    if (entry) {
      entry.status = result.success ? 'completed' : 'failed';
      entry.result = result;
    }
  }

  abort(id: string): boolean {
    const entry = this.agents.get(id);
    if (entry && entry.status === 'running') {
      entry.agent.abort();
      entry.status = 'aborted';
      return true;
    }
    return false;
  }

  get(id: string): RegisteredSubagent | undefined {
    return this.agents.get(id);
  }

  listRunning(): RegisteredSubagent[] {
    return Array.from(this.agents.values())
      .filter(a => a.status === 'running');
  }

  listAll(): RegisteredSubagent[] {
    return Array.from(this.agents.values());
  }

  getCount(): number {
    return this.agents.size;
  }

  getRunningCount(): number {
    return this.listRunning().length;
  }

  clear(): void {
    // Abort all running agents first
    for (const entry of this.agents.values()) {
      if (entry.status === 'running') {
        entry.agent.abort();
      }
    }
    this.agents.clear();
  }

  private calculateDepth(parentId: string): number {
    let depth = 0;
    let current = this.agents.get(parentId);

    while (current?.parentContext) {
      depth++;
      current = this.agents.get(current.parentContext);
    }

    return depth;
  }

  setMaxDepth(maxDepth: number): void {
    this.maxDepth = maxDepth;
  }

  getMaxDepth(): number {
    return this.maxDepth;
  }
}

// Singleton registry instance
export const subagentRegistry = new SubagentRegistry();
