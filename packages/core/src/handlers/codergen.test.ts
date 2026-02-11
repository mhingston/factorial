import { describe, expect, it, beforeEach, vi } from 'vitest';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '../context/index.js';
import type { Graph, LlmAdapter, Node } from '../types/index.js';

const { generateTextMock, generateObjectMock, jsonSchemaMock, openaiMock, anthropicMock, googleMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  generateObjectMock: vi.fn(),
  jsonSchemaMock: vi.fn((schema: unknown) => schema),
  openaiMock: vi.fn((model: string) => ({ provider: 'openai', model })),
  anthropicMock: vi.fn((model: string) => ({ provider: 'anthropic', model })),
  googleMock: vi.fn((model: string) => ({ provider: 'google', model })),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  generateObject: generateObjectMock,
  jsonSchema: jsonSchemaMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: openaiMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: anthropicMock,
}));

vi.mock('@ai-sdk/google', () => ({
  google: googleMock,
}));

import { CodergenHandler } from './builtin.js';

describe('CodergenHandler artifacts', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateObjectMock.mockReset();
    jsonSchemaMock.mockClear();
    openaiMock.mockClear();
    anthropicMock.mockClear();
    googleMock.mockClear();
  });

  it('routes codergen execution through adapter boundary', async () => {
    const completeMock = vi.fn().mockResolvedValue({
      adapter: 'test-adapter',
      backend: 'api',
      operation: 'generateText',
      mode: 'text',
      output: 'adapter-output',
      textOutput: 'adapter-output',
      usage: { totalTokens: 7 },
    });
    const adapter: LlmAdapter = {
      complete: completeMock,
      async *stream() {
        throw new Error('stream not implemented in test');
      },
    };

    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-adapter-'));
    const handler = new CodergenHandler(adapter);
    const context = new Context();
    const node = makeNode('adapter_node', { auto_status: true });

    const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
    expect(outcome.status).toBe('SUCCESS');
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(completeMock.mock.calls[0]?.[0]).toMatchObject({
      backend: 'api',
      nodeId: 'adapter_node',
      provider: 'openai',
      model: 'gpt-test',
    });
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(outcome.context_updates['codergen.adapter_node.adapter']).toBe('test-adapter');
    expect(outcome.context_updates['codergen.adapter_node.output']).toBe('adapter-output');
    expect(outcome.context_updates['codergen.adapter_node.usage.total_tokens']).toBe(7);
  });

  it('writes API artifacts for text generation', async () => {
    generateTextMock.mockResolvedValue({
      text: 'hello world',
      request: { id: 'req-text' },
      response: { id: 'resp-text' },
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      finishReason: 'stop',
      warnings: [],
      providerMetadata: { provider: 'openai' },
    });

    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-text-'));
    const handler = new CodergenHandler();
    const context = new Context();
    const node = makeNode('text_node', { auto_status: true });

    const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
    expect(outcome.status).toBe('SUCCESS');
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).not.toHaveBeenCalled();

    const stageDir = join(logsRoot, node.id);
    const output = await readJson(join(stageDir, 'output.json'));
    const apiRequest = await readJson(join(stageDir, 'api_request.json'));
    const apiResponse = await readJson(join(stageDir, 'api_response.json'));
    const validation = await readJson(join(stageDir, 'validation.json'));
    const events = await readJson(join(stageDir, 'events.json'));
    const ndjson = await readFile(join(stageDir, 'events.ndjson'), 'utf-8');

    expect(output.output_mode).toBe('text');
    expect(output.output).toBe('hello world');
    expect(output.usage).toEqual({
      input_tokens: 10,
      output_tokens: 2,
      total_tokens: 12,
    });
    expect(output.validation_result).toBe('skipped');
    expect(output.validation_errors).toEqual([]);
    expect(outcome.context_updates['codergen.text_node.usage.total_tokens']).toBe(12);
    expect(outcome.context_updates['budget.text_node.tokens_used']).toBe(12);
    expect(apiRequest.operation).toBe('generateText');
    expect(apiRequest.provider).toBe('openai');
    expect(apiResponse.operation).toBe('generateText');
    expect(apiResponse.output_mode).toBe('text');
    expect(apiResponse.output).toBe('hello world');
    expect(validation).toMatchObject({
      output_contract_required: false,
      schema_configured: false,
      result: 'skipped',
      checked: false,
      errors: [],
    });
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(2);
    expect(String(ndjson).trim().split('\n')).toHaveLength(2);
  });

  it('writes output_schema.json and structured output artifacts', async () => {
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
      additionalProperties: false,
    };

    generateObjectMock.mockResolvedValue({
      object: { summary: 'structured result' },
      request: { id: 'req-object' },
      response: { id: 'resp-object' },
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      finishReason: 'stop',
      warnings: [],
      providerMetadata: { provider: 'openai' },
    });

    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-object-'));
    const handler = new CodergenHandler();
    const context = new Context();
    const node = makeNode('object_node', {
      auto_status: true,
      attributes: {
        output_schema: JSON.stringify(schema),
        output_mode: 'json',
        output_schema_name: 'SummaryOutput',
        output_schema_description: 'Structured summary result.',
      },
    });

    const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
    expect(outcome.status).toBe('SUCCESS');
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(jsonSchemaMock).toHaveBeenCalledWith(schema);

    const stageDir = join(logsRoot, node.id);
    const outputSchema = await readJson(join(stageDir, 'output_schema.json'));
    const output = await readJson(join(stageDir, 'output.json'));
    const apiRequest = await readJson(join(stageDir, 'api_request.json'));
    const responseMd = await readFile(join(stageDir, 'response.md'), 'utf-8');
    const validation = await readJson(join(stageDir, 'validation.json'));

    expect(outputSchema.schema).toEqual(schema);
    expect(outputSchema.mode).toBe('json');
    expect(outputSchema.schema_name).toBe('SummaryOutput');
    expect(output.output_mode).toBe('object');
    expect(output.output).toEqual({ summary: 'structured result' });
    expect(output.validation_result).toBe('pass');
    expect(output.validation_errors).toEqual([]);
    expect(apiRequest.operation).toBe('generateObject');
    expect(validation).toMatchObject({
      output_contract_required: false,
      schema_configured: true,
      result: 'pass',
      checked: true,
      errors: [],
    });
    expect(responseMd).toContain('"summary": "structured result"');
  });

  it('writes CLI invocation/stdout/stderr artifacts in cli mode', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-cli-'));
    const handler = new CodergenHandler();
    const context = new Context();
    const node = makeNode('cli_node', {
      auto_status: true,
      attributes: {
        llm_backend: 'cli',
        cli_command: "printf 'cli backend output'",
      },
    });

    const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
    expect(outcome.status).toBe('SUCCESS');
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();

    const stageDir = join(logsRoot, node.id);
    const invocation = await readJson(join(stageDir, 'cli_invocation.json'));
    const stdout = await readFile(join(stageDir, 'stdout.log'), 'utf-8');
    const stderr = await readFile(join(stageDir, 'stderr.log'), 'utf-8');
    const output = await readJson(join(stageDir, 'output.json'));
    const events = await readJson(join(stageDir, 'events.json'));

    expect(invocation.backend).toBe('cli');
    expect(stdout).toBe('cli backend output');
    expect(stderr).toBe('');
    expect(output.output_mode).toBe('text');
    expect(output.output).toBe('cli backend output');
    expect(Array.isArray(events)).toBe(true);
    expect((events as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it('uses provider default CLI mappings and avoids SDK providers in cli mode', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-cli-defaults-'));
    const fakeBinDir = await mkdtemp(join(tmpdir(), 'attractor-codergen-bin-'));
    const pathValue = `${fakeBinDir}:${process.env.PATH ?? ''}`;

    await Promise.all([
      writeExecutable(fakeBinDir, 'codex', 'openai-cli-ok'),
      writeExecutable(fakeBinDir, 'claude', 'anthropic-cli-ok'),
      writeExecutable(fakeBinDir, 'gemini', 'google-cli-ok'),
    ]);

    const handler = new CodergenHandler();
    const context = new Context();
    const scenarios = [
      {
        id: 'openai_default_cli',
        provider: 'openai',
        model: 'gpt-4o-mini',
        executable: 'codex',
        argsPrefix: ['exec', '--json', '--sandbox', 'workspace-write', '--model', 'gpt-4o-mini'],
        stdout: 'openai-cli-ok',
      },
      {
        id: 'anthropic_default_cli',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        executable: 'claude',
        argsPrefix: ['-p', '--output-format', 'stream-json', '--model', 'claude-3-5-sonnet-latest'],
        stdout: 'anthropic-cli-ok',
      },
      {
        id: 'google_default_cli',
        provider: 'google',
        model: 'gemini-2.0-flash',
        executable: 'gemini',
        argsPrefix: ['-p', '--output-format', 'stream-json', '--model', 'gemini-2.0-flash', '--yolo'],
        stdout: 'google-cli-ok',
      },
    ] as const;

    for (const scenario of scenarios) {
      const node = makeNode(scenario.id, {
        auto_status: true,
        llm_provider: scenario.provider,
        llm_model: scenario.model,
        attributes: {
          llm_backend: 'cli',
          cli_env: {
            PATH: pathValue,
          },
        },
      });

      const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
      expect(outcome.status).toBe('SUCCESS');

      const stageDir = join(logsRoot, node.id);
      const invocation = await readJson(join(stageDir, 'cli_invocation.json')) as Record<string, unknown>;
      const args = invocation.args as string[];
      const output = await readJson(join(stageDir, 'output.json')) as Record<string, unknown>;

      expect(invocation.executable).toBe(scenario.executable);
      expect(Array.isArray(args)).toBe(true);
      expect(args.slice(0, scenario.argsPrefix.length)).toEqual(scenario.argsPrefix);
      expect(args.at(-1)).toContain('Generate output');
      expect(output.output_mode).toBe('text');
      expect(output.output).toBe(scenario.stdout);
    }

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(openaiMock).not.toHaveBeenCalled();
    expect(anthropicMock).not.toHaveBeenCalled();
    expect(googleMock).not.toHaveBeenCalled();
  });

  it('applies provider defaults from config.providers and api_key_env mapping', async () => {
    generateTextMock.mockResolvedValue({
      text: 'provider-config-result',
      request: { id: 'req-provider-config' },
      response: { id: 'resp-provider-config' },
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      finishReason: 'stop',
      warnings: [],
      providerMetadata: { provider: 'openai' },
    });

    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const previousCustomKey = process.env.MY_OPENAI_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.MY_OPENAI_KEY = 'custom-key-value';

    try {
      const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-provider-config-'));
      const handler = new CodergenHandler();
      const context = new Context();
      await context.set('config.default_provider', 'openai');
      await context.set('config.providers', {
        openai: {
          api_key_env: 'MY_OPENAI_KEY',
          default_model: 'gpt-4o-mini-from-provider-config',
        },
      });

      const node = makeNode('provider_config_node', {
        auto_status: true,
        llm_provider: undefined,
        llm_model: undefined,
      });

      const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
      expect(outcome.status).toBe('SUCCESS');
      expect(openaiMock).toHaveBeenCalledWith('gpt-4o-mini-from-provider-config');
      expect(process.env.OPENAI_API_KEY).toBe('custom-key-value');
    } finally {
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
      if (previousCustomKey === undefined) {
        delete process.env.MY_OPENAI_KEY;
      } else {
        process.env.MY_OPENAI_KEY = previousCustomKey;
      }
    }
  });

  it('parses structured CLI output when output_schema is provided', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-cli-obj-'));
    const handler = new CodergenHandler();
    const context = new Context();
    const node = makeNode('cli_object_node', {
      auto_status: true,
      attributes: {
        llm_backend: 'cli',
        cli_command: `printf '{"summary":"from cli"}'`,
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            summary: { type: 'string' },
          },
          required: ['summary'],
          additionalProperties: false,
        }),
        output_mode: 'json',
      },
    });

    const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
    expect(outcome.status).toBe('SUCCESS');

    const stageDir = join(logsRoot, node.id);
    const output = await readJson(join(stageDir, 'output.json'));
    const schema = await readJson(join(stageDir, 'output_schema.json'));
    const responseMd = await readFile(join(stageDir, 'response.md'), 'utf-8');

    expect(output.output_mode).toBe('object');
    expect(output.output).toEqual({ summary: 'from cli' });
    expect(schema.schema).toEqual({
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
      additionalProperties: false,
    });
    expect(responseMd).toContain('"summary": "from cli"');
  });

  it('fails when CLI structured output does not match output_schema', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-cli-invalid-'));
    const handler = new CodergenHandler();
    const context = new Context();
    const node = makeNode('cli_invalid_schema_node', {
      auto_status: true,
      attributes: {
        llm_backend: 'cli',
        cli_command: `printf '{"wrong":"shape"}'`,
        output_schema: JSON.stringify({
          type: 'object',
          properties: {
            summary: { type: 'string' },
          },
          required: ['summary'],
          additionalProperties: false,
        }),
      },
    });

    const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('schema validation');
    expect(outcome.failure_reason).toContain('missing required property');

    const stageDir = join(logsRoot, node.id);
    const output = await readJson(join(stageDir, 'output.json')) as Record<string, unknown>;
    const validation = await readJson(join(stageDir, 'validation.json')) as Record<string, unknown>;
    expect(output.status).toBe('fail');
    expect(output.failure_reason).toContain('schema validation');
    expect(output.validation_result).toBe('fail');
    expect(output.validation_errors).toEqual([
      '$.summary: missing required property',
      '$.wrong: additional properties are not allowed',
    ]);
    expect(validation.result).toBe('fail');
    expect(validation.checked).toBe(true);
  });

  it.each([
    {
      name: 'api backend',
      attributes: {
        output_contract_required: 'true',
      },
    },
    {
      name: 'cli backend',
      attributes: {
        llm_backend: 'cli',
        cli_command: `printf '{"summary":"from cli"}'`,
        output_contract_required: 'true',
      },
    },
  ])('fails deterministically when output contract is required without schema ($name)', async ({ attributes }) => {
    generateTextMock.mockResolvedValue({
      text: 'should not be used',
      request: { id: 'req-contract' },
      response: { id: 'resp-contract' },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
      warnings: [],
      providerMetadata: { provider: 'openai' },
    });

    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-codergen-contract-required-'));
    const handler = new CodergenHandler();
    const context = new Context();
    const node = makeNode('contract_required_node', {
      auto_status: true,
      attributes,
    });

    const outcome = await handler.execute(node, context, makeGraph(), logsRoot);
    expect(outcome.status).toBe('FAIL');
    expect(outcome.failure_reason).toContain('output_contract_required=true');
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();

    const stageDir = join(logsRoot, node.id);
    const output = await readJson(join(stageDir, 'output.json')) as Record<string, unknown>;
    const validation = await readJson(join(stageDir, 'validation.json')) as Record<string, unknown>;

    expect(output.status).toBe('fail');
    expect(output.validation_result).toBe('fail');
    expect(output.validation_errors).toEqual([
      'output_contract_required=true requires output_schema or output_schema_path',
    ]);
    expect(validation).toMatchObject({
      output_contract_required: true,
      schema_configured: false,
      result: 'fail',
      checked: true,
      errors: ['output_contract_required=true requires output_schema or output_schema_path'],
    });
  });
});

function makeGraph(): Graph {
  return {
    id: 'G',
    default_max_retry: 50,
    nodes: new Map(),
    edges: [],
    attributes: {},
  };
}

function makeNode(
  id: string,
  overrides: Partial<Node> & { attributes?: Record<string, unknown> } = {}
): Node {
  const baseNode: Node = {
    id,
    type: 'codergen',
    shape: 'box',
    label: id,
    prompt: 'Generate output',
    max_retries: 0,
    goal_gate: false,
    retry_target: undefined,
    fallback_retry_target: undefined,
    fidelity: undefined,
    thread_id: undefined,
    class: undefined,
    timeout: undefined,
    llm_model: 'gpt-test',
    llm_provider: 'openai',
    reasoning_effort: 'high',
    auto_status: false,
    allow_partial: false,
    attributes: {},
  };

  return {
    ...baseNode,
    ...overrides,
    attributes: {
      ...baseNode.attributes,
      ...(overrides.attributes ?? {}),
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8')) as unknown;
}

async function writeExecutable(directory: string, name: string, output: string): Promise<void> {
  const executablePath = join(directory, name);
  await writeFile(executablePath, `#!/bin/sh\nprintf '%s' '${output}'\n`);
  await chmod(executablePath, 0o755);
}
