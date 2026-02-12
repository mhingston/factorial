/**
 * Lightweight Subagent Implementation
 * Provides tool loop agent for simple parallelizable tasks
 */

import type { LlmAdapter, LlmCompleteRequest } from '../types/index.js';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface SubagentToolResult {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface SubagentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: SubagentMessageContent[];
  tool_call_id?: string;
}

export interface SubagentMessageContent {
  kind: 'TEXT' | 'TOOL_CALL' | 'TOOL_RESULT';
  text?: string;
  toolCall?: ToolCall;
}

export interface LightweightSubagentConfig {
  model: string;
  provider: string;
  instructions: string;
  allowedTools: string[];
  maxTurns: number;
  llmAdapter: LlmAdapter;
}

export interface SubagentResult {
  output: string;
  success: boolean;
  turnsUsed: number;
  toolCalls: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
}

export class LightweightSubagent {
  private config: LightweightSubagentConfig;
  private history: SubagentMessage[] = [];
  private turnCount = 0;
  private toolCallCount = 0;
  private tokenUsage = { input: 0, output: 0, total: 0 };
  private aborted = false;

  constructor(config: LightweightSubagentConfig) {
    this.config = config;

    // Initialize with system instructions
    this.history.push({
      role: 'system',
      content: [{ kind: 'TEXT', text: config.instructions }]
    });
  }

  async execute(task: string, signal?: AbortSignal): Promise<SubagentResult> {
    // Check if already aborted before starting
    if (this.aborted || signal?.aborted) {
      return {
        output: 'Error: Subagent execution aborted',
        success: false,
        turnsUsed: this.turnCount,
        toolCalls: this.toolCallCount,
        tokenUsage: this.tokenUsage
      };
    }

    // Add user task
    this.history.push({
      role: 'user',
      content: [{ kind: 'TEXT', text: task }]
    });

    try {
      while (this.turnCount < this.config.maxTurns && !this.aborted) {
        // Check abort signal before each LLM call
        if (signal?.aborted) {
          throw new Error('Subagent execution aborted');
        }

        // Convert messages to prompt for LLM adapter
        const prompt = this.messagesToPrompt();

        // Call LLM
        const request: LlmCompleteRequest = {
          backend: 'api',
          nodeId: 'subagent',
          provider: this.config.provider,
          model: this.config.model,
          prompt,
        };

        const response = await this.config.llmAdapter.complete(request);

        this.turnCount++;
        
        // Track token usage if available
        if (response.usage && typeof response.usage === 'object') {
          const usage = response.usage as { input_tokens?: number; output_tokens?: number };
          this.tokenUsage.input += usage.input_tokens || 0;
          this.tokenUsage.output += usage.output_tokens || 0;
          this.tokenUsage.total += (usage.input_tokens || 0) + (usage.output_tokens || 0);
        }

        const responseText = response.textOutput || String(response.output || '');

        // Add assistant response to history
        this.history.push({
          role: 'assistant',
          content: [{ kind: 'TEXT', text: responseText }]
        });

        // Check for tool calls in the response
        const toolCalls = this.extractToolCalls(responseText);

        if (toolCalls.length > 0) {
          this.toolCallCount += toolCalls.length;

          // Execute tools
          const toolResults = await this.executeTools(toolCalls);

          // Add tool results to history
          for (const result of toolResults) {
            this.history.push({
              role: 'tool',
              content: [{ kind: 'TOOL_RESULT', text: result.result }],
              tool_call_id: result.toolCallId
            });
          }
        } else {
          // No tool calls, task complete
          return {
            output: responseText,
            success: true,
            turnsUsed: this.turnCount,
            toolCalls: this.toolCallCount,
            tokenUsage: this.tokenUsage
          };
        }
      }

      // Max turns reached
      return {
        output: this.getLastAssistantMessage(),
        success: false,
        turnsUsed: this.turnCount,
        toolCalls: this.toolCallCount,
        tokenUsage: this.tokenUsage
      };

    } catch (error) {
      return {
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
        turnsUsed: this.turnCount,
        toolCalls: this.toolCallCount,
        tokenUsage: this.tokenUsage
      };
    }
  }

  private messagesToPrompt(): string {
    return this.history.map(msg => {
      const content = msg.content
        .filter(c => c.kind === 'TEXT')
        .map(c => c.text)
        .join('');
      return `${msg.role}: ${content}`;
    }).join('\n\n');
  }

  private extractToolCalls(text: string): ToolCall[] {
    // Simple extraction for tool calls in format:
    // <tool>tool_name</tool>
    // <tool_arguments>{"key": "value"}</tool_arguments>
    const toolCalls: ToolCall[] = [];
    const toolRegex = /<tool>(\w+)<\/tool>[\s\S]*?<tool_arguments>([\s\S]*?)<\/tool_arguments>/g;
    let match;

    while ((match = toolRegex.exec(text)) !== null) {
      try {
        const args = JSON.parse(match[2]);
        toolCalls.push({
          id: `call_${toolCalls.length}`,
          name: match[1],
          arguments: args
        });
      } catch {
        // Skip invalid tool calls
      }
    }

    return toolCalls;
  }

  private async executeTools(toolCalls: ToolCall[]): Promise<SubagentToolResult[]> {
    // This is a placeholder - actual tool execution would be provided
    // by the caller or configured during instantiation
    return toolCalls.map(tc => ({
      toolCallId: tc.id,
      result: `Tool ${tc.name} execution not implemented in lightweight agent`,
      isError: true
    }));
  }

  private getLastAssistantMessage(): string {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === 'assistant') {
        return this.history[i].content
          .filter(c => c.kind === 'TEXT')
          .map(c => c.text || '')
          .join('');
      }
    }
    return '';
  }

  abort(): void {
    this.aborted = true;
  }

  isAborted(): boolean {
    return this.aborted;
  }

  getHistory(): SubagentMessage[] {
    return [...this.history];
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  getTokenUsage(): { input: number; output: number; total: number } {
    return { ...this.tokenUsage };
  }
}
