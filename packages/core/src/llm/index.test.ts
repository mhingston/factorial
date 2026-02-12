import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, generateObjectMock, jsonSchemaMock, openaiMock, streamTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  generateObjectMock: vi.fn(),
  jsonSchemaMock: vi.fn((schema: unknown) => schema),
  openaiMock: vi.fn((model: string) => ({ provider: 'openai', model })),
  streamTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  generateObject: generateObjectMock,
  jsonSchema: jsonSchemaMock,
  streamText: streamTextMock,
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
    streamTextMock.mockReset();
  });

  it('streams start/delta/end events for api backend', async () => {
    streamTextMock.mockReturnValue(
      makeStreamTextResult(['api ', 'stream ', 'output'], {
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      })
    );

    const adapter = createDefaultLlmAdapter();
    const events = await collectEvents(adapter.stream(baseApiStreamRequest()));

    expect(openaiMock).toHaveBeenCalledWith('gpt-test');
    expect(events.map(event => event.type)).toEqual([
      'llm.stream.start',
      'llm.stream.delta',
      'llm.stream.delta',
      'llm.stream.delta',
      'llm.stream.end',
    ]);
    expect(collectDeltaText(events)).toBe('api stream output');
    const endEvent = events.at(-1) as LlmStreamEvent;
    expect((endEvent.data as Record<string, unknown>).text_output).toBe('api stream output');
  });

  it('proves parity where accumulate(stream) equals complete for api backend', async () => {
    streamTextMock.mockReturnValue(
      makeStreamTextResult(['api ', 'parity ', 'output'], {
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
      })
    );
    generateTextMock.mockResolvedValue({
      text: 'api parity output',
      request: { id: 'req-complete' },
      response: { id: 'res-complete' },
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
      finishReason: 'stop',
      warnings: [],
      providerMetadata: { provider: 'openai' },
    });

    const adapter = createDefaultLlmAdapter();
    const request = baseApiStreamRequest();
    const streamEvents = await collectEvents(adapter.stream(request));
    const complete = await adapter.complete({
      backend: 'api',
      nodeId: request.nodeId,
      provider: request.provider,
      model: request.model,
      prompt: request.prompt,
    });

    expect(streamEvents.map(event => event.type)).toContain('llm.stream.delta');
    expect(collectDeltaText(streamEvents)).toBe(complete.textOutput);
  });

  it('streams start/delta/end events for cli backend', async () => {
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
      'llm.stream.delta',
      'llm.stream.end',
    ]);
    expect(collectDeltaText(events)).toBe('cli stream output');
  });

  it('proves parity where accumulate(stream) equals complete for cli backend', async () => {
    const adapter = createDefaultLlmAdapter();
    const request = {
      backend: 'cli' as const,
      nodeId: 'node-cli-parity',
      provider: 'openai',
      model: 'gpt-test',
      prompt: 'ignored',
      cli: {
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("cli parity output")'],
        cwd: process.cwd(),
        timeoutMs: 5000,
        logsRoot: process.cwd(),
        stageDir: process.cwd(),
      },
    };
    const events = await collectEvents(adapter.stream(request));
    const complete = await adapter.complete({
      backend: request.backend,
      nodeId: request.nodeId,
      provider: request.provider,
      model: request.model,
      prompt: request.prompt,
      cli: request.cli,
    });

    expect(events.map(event => event.type)).toContain('llm.stream.delta');
    expect(collectDeltaText(events)).toBe(complete.textOutput);
  });

  it('emits deterministic stream error for aborted api stream', async () => {
    streamTextMock.mockImplementation(({ abortSignal }: { abortSignal?: AbortSignal }) =>
      makeStreamTextResult([], {
        textStream: async function* () {
          if (abortSignal?.aborted) {
            throw new Error('stream aborted');
          }
          yield 'unused';
        },
      })
    );

    const controller = new AbortController();
    controller.abort();
    const adapter = createDefaultLlmAdapter();
    const events = await collectEvents(
      adapter.stream({
        ...baseApiStreamRequest(),
        signal: controller.signal,
      })
    );

    expect(events.map(event => event.type)).toEqual(['llm.stream.start', 'llm.stream.error']);
    expect(String((events[1].data as Record<string, unknown>).error)).toContain('stream aborted');
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

function collectDeltaText(events: LlmStreamEvent[]): string {
  return events
    .filter(event => event.type === 'llm.stream.delta')
    .map(event => String((event.data as Record<string, unknown>).delta ?? ''))
    .join('');
}

function baseApiStreamRequest(): LlmStreamRequest {
  return {
    backend: 'api',
    nodeId: 'node-api',
    provider: 'openai',
    model: 'gpt-test',
    prompt: 'hello',
  };
}

function makeStreamTextResult(
  chunks: string[],
  overrides: {
    textStream?: () => AsyncGenerator<string>;
    usage?: unknown;
  } = {}
): {
  textStream: AsyncGenerator<string>;
  request: Promise<unknown>;
  response: Promise<unknown>;
  finishReason: Promise<unknown>;
  warnings: Promise<unknown>;
  providerMetadata: Promise<unknown>;
  totalUsage: Promise<unknown>;
} {
  const textStream =
    overrides.textStream?.() ??
    (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })();

  return {
    textStream,
    request: Promise.resolve({ id: 'req-stream' }),
    response: Promise.resolve({ id: 'res-stream' }),
    finishReason: Promise.resolve('stop'),
    warnings: Promise.resolve([]),
    providerMetadata: Promise.resolve({ provider: 'openai' }),
    totalUsage: Promise.resolve(
      overrides.usage ?? {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      }
    ),
  };
}
