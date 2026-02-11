import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, generateObjectMock, jsonSchemaMock, openaiMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  generateObjectMock: vi.fn(),
  jsonSchemaMock: vi.fn((schema: unknown) => schema),
  openaiMock: vi.fn((model: string) => ({ provider: 'openai', model })),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  generateObject: generateObjectMock,
  jsonSchema: jsonSchemaMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: openaiMock,
}));

import type { LlmStreamEvent, LlmStreamRequest } from '../types/index.js';
import { createDefaultLlmAdapter } from './index.js';

describe('DefaultLlmAdapter stream', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateObjectMock.mockReset();
    jsonSchemaMock.mockClear();
    openaiMock.mockClear();
  });

  it('streams start/text/end events for api backend', async () => {
    generateTextMock.mockResolvedValue({
      text: 'api stream output',
      request: { id: 'req-1' },
      response: { id: 'res-1' },
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      finishReason: 'stop',
      warnings: [],
      providerMetadata: { provider: 'openai' },
    });

    const adapter = createDefaultLlmAdapter();
    const events = await collectEvents(
      adapter.stream({
        backend: 'api',
        nodeId: 'node-api',
        provider: 'openai',
        model: 'gpt-test',
        prompt: 'hello',
      })
    );

    expect(openaiMock).toHaveBeenCalledWith('gpt-test');
    expect(events.map(event => event.type)).toEqual([
      'llm.stream.start',
      'llm.stream.text',
      'llm.stream.end',
    ]);
    expect((events[1].data as Record<string, unknown>).text).toBe('api stream output');
  });

  it('streams start/text/end events for cli backend', async () => {
    const adapter = createDefaultLlmAdapter();
    const events = await collectEvents(
      adapter.stream({
        backend: 'cli',
        nodeId: 'node-cli',
        provider: 'openai',
        model: 'gpt-test',
        prompt: 'ignored',
        cli: {
          executable: process.execPath,
          args: ['-e', 'process.stdout.write("cli stream output")'],
          cwd: process.cwd(),
          timeoutMs: 5000,
          logsRoot: process.cwd(),
          stageDir: process.cwd(),
        },
      })
    );

    expect(events.map(event => event.type)).toEqual([
      'llm.stream.start',
      'llm.stream.text',
      'llm.stream.end',
    ]);
    expect((events[1].data as Record<string, unknown>).text).toBe('cli stream output');
  });

  it('emits stream error event when backend invocation fails', async () => {
    const adapter = createDefaultLlmAdapter();
    const events = await collectEvents(
      adapter.stream({
        backend: 'cli',
        nodeId: 'node-error',
        provider: 'openai',
        model: 'gpt-test',
        prompt: 'hello',
      })
    );

    expect(events.map(event => event.type)).toEqual(['llm.stream.start', 'llm.stream.error']);
    expect(String((events[1].data as Record<string, unknown>).error)).toContain(
      'CLI backend requires cli invocation config'
    );
  });
});

async function collectEvents(iterator: AsyncGenerator<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterator) {
    events.push(event);
  }
  return events;
}
