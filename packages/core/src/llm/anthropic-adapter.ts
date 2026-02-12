/**
 * Anthropic Adapter with Prompt Caching (SA-003)
 * Implements automatic cache_control annotation for Anthropic Messages API
 */

import type {
  LlmAdapter,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmStreamEvent,
  LlmStreamRequest,
  Message,
} from '../types/index.js';
import {
  type ExtractionResult,
  extractAnthropicReasoning,
} from './reasoning-extraction.js';

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  betaHeaders?: string[];
  enableCaching?: boolean;
  cacheStrategy?: 'system-only' | 'system-plus-early' | 'aggressive';
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

interface AnthropicRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicThinkingBlock | AnthropicRedactedThinkingBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: (AnthropicContentBlock | AnthropicToolUse)[];
  model: string;
  stop_reason?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export class AnthropicAdapter implements LlmAdapter {
  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    this.config = {
      enableCaching: true,
      cacheStrategy: 'system-plus-early',
      ...config,
    };
  }

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
    const { messages, systemPrompt } = this.convertMessages(request.messages || []);

    const messagesWithCaching = this.config.enableCaching
      ? this.injectCacheBreakpoints(messages, this.config.cacheStrategy!)
      : messages;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: messagesWithCaching,
      max_tokens: 4096,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (request.outputSchema) {
      body.tools = [this.convertSchemaToTool(request.outputSchema, request.outputSchemaName)];
      body.tool_choice = { type: 'tool', name: request.outputSchemaName || 'generate_output' };
    }

    const response = await fetch(`${this.config.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        ...(this.config.betaHeaders?.length && {
          'anthropic-beta': this.config.betaHeaders.join(','),
        }),
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as AnthropicResponse;

    const extraction = this.extractReasoning(result);
    const output = this.extractOutput(result, request.outputSchema);

    return {
      adapter: 'anthropic-direct',
      backend: 'api',
      operation: request.outputSchema ? 'generateObject' : 'generateText',
      mode: request.outputSchema ? 'object' : 'text',
      output,
      textOutput: extraction.text,
      response: result,
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_read_tokens: result.usage.cache_read_input_tokens,
        cache_write_tokens: result.usage.cache_creation_input_tokens,
      },
      finishReason: result.stop_reason,
      reasoning: extraction.reasoning,
      reasoningTokens: extraction.reasoningTokens,
    };
  }

  async *stream(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    const startedAt = new Date().toISOString();
    yield {
      type: 'llm.stream.start',
      data: {
        node_id: request.nodeId,
        backend: 'api',
        provider: 'anthropic',
        model: request.model,
        timestamp: startedAt,
      },
    };

    try {
      const { messages, systemPrompt } = this.convertMessages(request.messages || []);

      const messagesWithCaching = this.config.enableCaching
        ? this.injectCacheBreakpoints(messages, this.config.cacheStrategy!)
        : messages;

      const body: Record<string, unknown> = {
        model: request.model,
        messages: messagesWithCaching,
        max_tokens: 4096,
        stream: true,
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      const response = await fetch(`${this.config.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          ...(this.config.betaHeaders?.length && {
            'anthropic-beta': this.config.betaHeaders.join(','),
          }),
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let textOutput = '';
      let finalResult: AnthropicResponse | undefined;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              if (event.type === 'content_block_delta' && event.delta?.text) {
                textOutput += event.delta.text;
                yield {
                  type: 'llm.stream.delta',
                  data: {
                    node_id: request.nodeId,
                    backend: 'api',
                    provider: 'anthropic',
                    model: request.model,
                    delta: event.delta.text,
                    timestamp: new Date().toISOString(),
                  },
                };
              }

              if (event.type === 'message_stop' && event.message) {
                finalResult = event.message;
              }
            } catch {
              // Ignore malformed events
            }
          }
        }
      }

      // Decode any remaining content
      if (buffer) {
        const remaining = decoder.decode();
        if (remaining) {
          buffer += remaining;
        }
      }

      yield {
        type: 'llm.stream.end',
        data: {
          node_id: request.nodeId,
          adapter: 'anthropic-direct',
          backend: 'api',
          operation: 'generateText',
          mode: 'text',
          output: textOutput,
          text_output: textOutput,
          usage: finalResult?.usage
            ? {
                input_tokens: finalResult.usage.input_tokens,
                output_tokens: finalResult.usage.output_tokens,
                cache_read_tokens: finalResult.usage.cache_read_input_tokens,
                cache_write_tokens: finalResult.usage.cache_creation_input_tokens,
              }
            : undefined,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      yield {
        type: 'llm.stream.error',
        data: {
          node_id: request.nodeId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  private injectCacheBreakpoints(
    messages: AnthropicMessage[],
    strategy: string
  ): AnthropicMessage[] {
    switch (strategy) {
      case 'system-only':
        return this.cacheSystemMessageOnly(messages);
      case 'system-plus-early':
        return this.cacheSystemPlusEarly(messages);
      case 'aggressive':
        return this.cacheAggressively(messages);
      default:
        return messages;
    }
  }

  private cacheSystemMessageOnly(messages: AnthropicMessage[]): AnthropicMessage[] {
    if (messages.length === 0) return messages;

    const firstMessage = messages[0];
    if (firstMessage.role === 'user' && firstMessage.content.length > 0) {
      return [
        {
          ...firstMessage,
          content: this.addCacheControlToLastBlock(firstMessage.content),
        },
        ...messages.slice(1),
      ];
    }

    return messages;
  }

  private cacheSystemPlusEarly(messages: AnthropicMessage[]): AnthropicMessage[] {
    return messages.map((msg, index) => {
      if (msg.role === 'user' && index <= 2 && msg.content.length > 0) {
        return {
          ...msg,
          content: this.addCacheControlToLastBlock(msg.content),
        };
      }
      return msg;
    });
  }

  private cacheAggressively(messages: AnthropicMessage[]): AnthropicMessage[] {
    return messages.map((msg, index) => {
      if (index < messages.length - 1 && msg.content.length > 0) {
        return {
          ...msg,
          content: this.addCacheControlToLastBlock(msg.content),
        };
      }
      return msg;
    });
  }

  private addCacheControlToLastBlock(content: AnthropicContentBlock[]): AnthropicContentBlock[] {
    if (content.length === 0) return content;

    const lastIndex = content.length - 1;
    return content.map((block, index) => {
      if (index === lastIndex && block.type === 'text') {
        return { ...block, cache_control: { type: 'ephemeral' } };
      }
      return block;
    });
  }

  private convertMessages(messages: Message[]): { messages: AnthropicMessage[]; systemPrompt?: string } {
    const anthropicMessages: AnthropicMessage[] = [];
    let systemPrompt: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content.map(c => c.text).join('');
        continue;
      }

      const content: AnthropicContentBlock[] = [];

      for (const part of msg.content) {
        if (part.kind === 'TEXT' && part.text) {
          content.push({ type: 'text', text: part.text });
        }
      }

      if (content.length > 0) {
        anthropicMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content,
        });
      }
    }

    return { messages: anthropicMessages, systemPrompt };
  }

  private convertSchemaToTool(schema: Record<string, unknown>, name?: string): AnthropicTool {
    return {
      name: name || 'generate_output',
      description: 'Generate structured output',
      input_schema: schema,
    };
  }

  private extractOutput(result: AnthropicResponse, outputSchema?: Record<string, unknown> | null): unknown {
    if (outputSchema) {
      // Tool use blocks are included in content when using tools
      const toolUseBlock = result.content.find(
        (block) => block.type === 'tool_use'
      ) as AnthropicToolUse | undefined;
      if (toolUseBlock) {
        return toolUseBlock.input;
      }
    }

    return result.content
      .filter((block): block is AnthropicTextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  private extractReasoning(response: AnthropicResponse): ExtractionResult {
    // Filter out tool_use blocks as they're not valid reasoning blocks
    const reasoningContent = response.content.filter(
      (block): block is AnthropicContentBlock => block.type !== 'tool_use'
    );
    return extractAnthropicReasoning({
      content: reasoningContent,
      usage: response.usage,
    });
  }
}

export function createAnthropicAdapter(config: AnthropicConfig): AnthropicAdapter {
  return new AnthropicAdapter(config);
}
