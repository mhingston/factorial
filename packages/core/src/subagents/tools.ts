/**
 * Subagent Tools
 * Implements spawn_agent, wait, send_input, close_agent tools
 */

import type { Context, Graph, Node } from '../types/index.js';
import type { LightweightSubagent, SubagentResult } from './lightweight-agent.js';
import { SubagentRegistry, subagentRegistry } from './registry.js';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  content: unknown;
  is_error: boolean;
}

export interface ToolContext {
  node: Node;
  context: Context;
  graph: Graph;
  logsRoot: string;
}

/**
 * Generate unique agent ID
 */
function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Summarize subagent result for parent context
 * Per Vercel AI SDK pattern: summarize to keep parent context clean
 */
export function toModelOutput(result: SubagentResult, maxLength: number = 500): string {
  if (result.success) {
    const output = result.output.slice(0, maxLength);
    const ellipsis = result.output.length > maxLength ? '...' : '';
    return `Task completed successfully in ${result.turnsUsed} turns. ${output}${ellipsis}`;
  } else {
    const output = result.output.slice(0, maxLength);
    const ellipsis = result.output.length > maxLength ? '...' : '';
    return `Task failed after ${result.turnsUsed} turns. ${output}${ellipsis}`;
  }
}

export class SpawnAgentTool implements Tool {
  name = 'spawn_agent';
  description = `Spawn a lightweight subagent to handle a scoped task.
Use this for parallelizable work that can run independently.
The subagent runs with its own context window and returns a summary.`;

  parameters = {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'The task to complete'
      },
      model: {
        type: 'string',
        description: 'Optional model override (defaults to parent model)'
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tool subset (defaults to read, shell, grep)'
      },
      parent_id: {
        type: 'string',
        description: 'Optional parent agent ID for depth tracking'
      }
    },
    required: ['task']
  };

  private registry: SubagentRegistry;
  private agentFactory: (config: Record<string, unknown>) => LightweightSubagent;

  constructor(
    registry: SubagentRegistry = subagentRegistry,
    agentFactory?: (config: Record<string, unknown>) => LightweightSubagent
  ) {
    this.registry = registry;
    this.agentFactory = agentFactory || this.defaultAgentFactory;
  }

  private defaultAgentFactory(config: Record<string, unknown>): LightweightSubagent {
    // Import here to avoid circular dependency
    const { LightweightSubagent } = require('./lightweight-agent.js');
    return new LightweightSubagent(config as Parameters<typeof LightweightSubagent['prototype']['constructor']>[0]);
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const task = args.task as string;
    if (!task) {
      return {
        content: 'Error: task parameter is required',
        is_error: true
      };
    }

    const agentId = generateAgentId();

    try {
      // Get configuration from parent context
      const parentModel = (args.model as string) ||
        await context.context.getString('llm.model') ||
        'gpt-4o-mini';

      const allowedTools = (args.tools as string[]) || ['read_file', 'shell', 'grep', 'glob'];
      const parentId = args.parent_id as string | undefined;

      // Create subagent config
      const config = {
        model: parentModel,
        provider: await context.context.getString('llm.provider') || 'openai',
        instructions: `You are a focused subagent. Complete the task efficiently and provide a clear summary of your findings.
Be concise - your output will be summarized for the parent agent.`,
        allowedTools,
        maxTurns: 50,
        llmAdapter: context.context.get('llm.adapter') as unknown as { complete: (req: unknown) => Promise<unknown> } || null
      };

      // Create subagent
      const subagent = this.agentFactory(config);

      // Register in registry
      this.registry.register(agentId, subagent, parentId);

      // Start execution (non-blocking)
      subagent.execute(task).then(result => {
        this.registry.complete(agentId, result);
      }).catch(error => {
        this.registry.complete(agentId, {
          output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          success: false,
          turnsUsed: 0,
          toolCalls: 0,
          tokenUsage: { input: 0, output: 0, total: 0 }
        });
      });

      return {
        content: {
          agent_id: agentId,
          status: 'running',
          message: 'Subagent spawned and running'
        },
        is_error: false
      };
    } catch (error) {
      return {
        content: `Error spawning agent: ${error instanceof Error ? error.message : String(error)}`,
        is_error: true
      };
    }
  }
}

export class WaitForAgentTool implements Tool {
  name = 'wait';
  description = 'Wait for a subagent to complete and return its result.';

  parameters = {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'The agent ID returned by spawn_agent'
      },
      timeout_ms: {
        type: 'number',
        description: 'Optional timeout in milliseconds'
      }
    },
    required: ['agent_id']
  };

  private registry: SubagentRegistry;

  constructor(registry: SubagentRegistry = subagentRegistry) {
    this.registry = registry;
  }

  async execute(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const agentId = args.agent_id as string;
    const timeoutMs = (args.timeout_ms as number) || 300000;  // 5 min default

    if (!agentId) {
      return {
        content: 'Error: agent_id parameter is required',
        is_error: true
      };
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const entry = this.registry.get(agentId);

      if (!entry) {
        return {
          content: `Error: Agent ${agentId} not found`,
          is_error: true
        };
      }

      if (entry.status !== 'running') {
        // Return summarized result (toModelOutput pattern)
        const result = entry.result!;
        return {
          content: {
            output: result.output,
            success: result.success,
            turns_used: result.turnsUsed,
            token_usage: result.tokenUsage,
            // Summarized for parent context
            summary: toModelOutput(result)
          },
          is_error: !result.success
        };
      }

      // Poll every 100ms
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
      content: `Timeout waiting for agent ${agentId} after ${timeoutMs}ms`,
      is_error: true
    };
  }
}

export class SendInputTool implements Tool {
  name = 'send_input';
  description = 'Send additional input to a running subagent (steering).';

  parameters = {
    type: 'object',
    properties: {
      agent_id: { type: 'string' },
      message: { type: 'string' }
    },
    required: ['agent_id', 'message']
  };

  private registry: SubagentRegistry;

  constructor(registry: SubagentRegistry = subagentRegistry) {
    this.registry = registry;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = args.agent_id as string;
    const message = args.message as string;

    if (!agentId || !message) {
      return {
        content: 'Error: both agent_id and message parameters are required',
        is_error: true
      };
    }

    const entry = this.registry.get(agentId);

    if (!entry) {
      return {
        content: `Error: Agent ${agentId} not found`,
        is_error: true
      };
    }

    if (entry.status !== 'running') {
      return {
        content: `Error: Agent ${agentId} is not running (status: ${entry.status})`,
        is_error: true
      };
    }

    // Note: Actual steering implementation would require extending
    // LightweightSubagent to accept mid-task input via a queue
    // For now, we return a placeholder
    return {
      content: {
        sent: true,
        agent_id: agentId,
        message: message.slice(0, 100) // Truncate for safety
      },
      is_error: false
    };
  }
}

export class CloseAgentTool implements Tool {
  name = 'close_agent';
  description = 'Forcefully terminate a subagent.';

  parameters = {
    type: 'object',
    properties: {
      agent_id: { type: 'string' }
    },
    required: ['agent_id']
  };

  private registry: SubagentRegistry;

  constructor(registry: SubagentRegistry = subagentRegistry) {
    this.registry = registry;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = args.agent_id as string;

    if (!agentId) {
      return {
        content: 'Error: agent_id parameter is required',
        is_error: true
      };
    }

    const success = this.registry.abort(agentId);

    if (!success) {
      return {
        content: `Agent ${agentId} not found or already terminated`,
        is_error: true
      };
    }

    return {
      content: {
        closed: true,
        agent_id: agentId
      },
      is_error: false
    };
  }
}

// Export tool instances bound to default registry
export const spawnAgentTool = new SpawnAgentTool();
export const waitForAgentTool = new WaitForAgentTool();
export const sendInputTool = new SendInputTool();
export const closeAgentTool = new CloseAgentTool();
