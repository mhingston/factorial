/**
 * Tests for AnthropicAdapter with Prompt Caching (SA-003)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicAdapter, createAnthropicAdapter } from './anthropic-adapter.js';

describe('AnthropicAdapter', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('cache breakpoint injection', () => {
    it('injects cache control for system message with system-only strategy', () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
        cacheStrategy: 'system-only',
      });

      const messages = [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'You are helpful' }],
        },
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'Hello' }],
        },
      ];

      const result = (adapter as unknown as { injectCacheBreakpoints: (m: typeof messages, s: string) => typeof messages })
        .injectCacheBreakpoints(messages, 'system-only');

      expect(result[0].content[0]).toHaveProperty('cache_control', { type: 'ephemeral' });
      expect(result[1].content[0]).not.toHaveProperty('cache_control');
    });

    it('caches early user messages with system-plus-early strategy', () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
        cacheStrategy: 'system-plus-early',
      });

      const messages = [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'System prompt' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'First user message' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Second user message' }] },
        { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Response' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Third user message' }] },
      ];

      const result = (adapter as unknown as { injectCacheBreakpoints: (m: typeof messages, s: string) => typeof messages })
        .injectCacheBreakpoints(messages, 'system-plus-early');

      // First 3 user messages (indices 0, 1, 2) should have cache_control
      expect(result[0].content[0]).toHaveProperty('cache_control');
      expect(result[1].content[0]).toHaveProperty('cache_control');
      expect(result[2].content[0]).toHaveProperty('cache_control');
      // Assistant messages and later user messages should not
      expect(result[3].content[0]).not.toHaveProperty('cache_control');
      expect(result[4].content[0]).not.toHaveProperty('cache_control');
    });

    it('caches all messages except last with aggressive strategy', () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
        cacheStrategy: 'aggressive',
      });

      const messages = [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Message 1' }] },
        { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Response 1' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Message 2' }] },
        { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Response 2' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Latest' }] },
      ];

      const result = (adapter as unknown as { injectCacheBreakpoints: (m: typeof messages, s: string) => typeof messages })
        .injectCacheBreakpoints(messages, 'aggressive');

      // All except last should have cache_control
      expect(result[0].content[0]).toHaveProperty('cache_control');
      expect(result[1].content[0]).toHaveProperty('cache_control');
      expect(result[2].content[0]).toHaveProperty('cache_control');
      expect(result[3].content[0]).toHaveProperty('cache_control');
      expect(result[4].content[0]).not.toHaveProperty('cache_control');
    });

    it('respects enableCaching=false', async () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
        enableCaching: false,
        cacheStrategy: 'system-only',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-opus-20240229',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      });

      await adapter.complete({
        backend: 'api',
        nodeId: 'test-node',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        prompt: 'Hello',
        messages: [
          { role: 'user', content: [{ kind: 'TEXT', text: 'Hello' }] },
        ],
      });

      // Verify that cache_control was NOT added to the request
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[0]).not.toHaveProperty('cache_control');
    });
  });

  describe('API integration', () => {
    it('makes correct API request with caching enabled', async () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-api-key',
        cacheStrategy: 'system-only',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-opus-20240229',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 80,
            cache_creation_input_tokens: 20,
          },
        }),
      });

      const result = await adapter.complete({
        backend: 'api',
        nodeId: 'test-node',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        prompt: 'Hello',
        messages: [
          { role: 'user', content: [{ kind: 'TEXT', text: 'Hello' }] },
        ],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
          body: expect.any(String),
        })
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[0]).toHaveProperty('cache_control', { type: 'ephemeral' });

      expect(result.usage).toEqual({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 80,
        cache_write_tokens: 20,
      });
    });

    it('extracts text from response correctly', async () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'The answer is 42' }],
          model: 'claude-3-opus-20240229',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const result = await adapter.complete({
        backend: 'api',
        nodeId: 'test-node',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        prompt: 'What is the answer?',
      });

      expect(result.textOutput).toBe('The answer is 42');
      expect(result.output).toBe('The answer is 42');
    });

    it('extracts reasoning from thinking blocks', async () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Let me think about this...', signature: 'abc123' },
            { type: 'text', text: 'The answer is 42' },
          ],
          model: 'claude-3-opus-20240229',
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const result = await adapter.complete({
        backend: 'api',
        nodeId: 'test-node',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        prompt: 'Think step by step',
      });

      expect(result.reasoning).toBe('Let me think about this...');
      expect(result.textOutput).toBe('The answer is 42');
    });

    it('handles structured output with tools', async () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'generate_output',
              input: { result: 'success', value: 42 },
            },
          ],
          model: 'claude-3-opus-20240229',
          usage: { input_tokens: 50, output_tokens: 30 },
        }),
      });

      const result = await adapter.complete({
        backend: 'api',
        nodeId: 'test-node',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        prompt: 'Generate structured output',
        outputSchema: {
          type: 'object',
          properties: {
            result: { type: 'string' },
            value: { type: 'number' },
          },
        },
        outputSchemaName: 'generate_output',
      });

      expect(result.mode).toBe('object');
      expect(result.output).toEqual({ result: 'success', value: 42 });
    });

    it('throws on API error', async () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        adapter.complete({
          backend: 'api',
          nodeId: 'test-node',
          provider: 'anthropic',
          model: 'claude-3-opus-20240229',
          prompt: 'Hello',
        })
      ).rejects.toThrow('Anthropic API error: 401 - Unauthorized');
    });
  });

  describe('factory function', () => {
    it('creates adapter with default config', () => {
      const adapter = createAnthropicAdapter({
        apiKey: 'test-key',
      });

      expect(adapter).toBeInstanceOf(AnthropicAdapter);
    });
  });
});
