import { generateObject, generateText, jsonSchema, streamText } from 'ai';
import { spawn } from 'node:child_process';
import type {
  LlmAdapter,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmStreamEvent,
  LlmStreamRequest,
} from '../types/index.js';

type ProviderEnvKey = 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'GOOGLE_GENERATIVE_AI_API_KEY';

interface ProviderSettings {
  apiKeyEnv?: string;
}

export class DefaultLlmAdapter implements LlmAdapter {
  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
    if (request.backend === 'api') {
      return completeApi(request);
    }
    return completeCli(request);
  }

  async *stream(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    const startedAt = new Date().toISOString();
    yield {
      type: 'llm.stream.start',
      data: {
        node_id: request.nodeId,
        backend: request.backend,
        provider: request.provider,
        model: request.model,
        timestamp: startedAt,
      },
    };

    try {
      if (request.backend === 'api' && !request.outputSchema) {
        for await (const event of streamApiText(request)) {
          yield event;
        }
        return;
      }

      if (request.backend === 'cli') {
        for await (const event of streamCli(request)) {
          yield event;
        }
        return;
      }

      const result = await this.complete({
        backend: request.backend,
        nodeId: request.nodeId,
        provider: request.provider,
        model: request.model,
        prompt: request.prompt,
        providerApiKeyEnv: request.providerApiKeyEnv,
        outputSchema: request.outputSchema,
        outputSchemaName: request.outputSchemaName,
        outputSchemaDescription: request.outputSchemaDescription,
        outputMode: request.outputMode,
        cli: request.cli,
        signal: request.signal,
      });

      if (result.mode === 'object') {
        yield {
          type: 'llm.stream.object',
          data: {
            output: result.output,
            text_output: result.textOutput,
            timestamp: new Date().toISOString(),
          },
        };
      } else if (result.textOutput.length > 0) {
        yield createStreamDeltaEvent(request, result.textOutput);
      }

      yield {
        type: 'llm.stream.end',
        data: buildStreamEndData(request.nodeId, result),
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
}

export function createDefaultLlmAdapter(): LlmAdapter {
  return new DefaultLlmAdapter();
}

async function completeApi(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
  applyProviderEnvOverrides(request.provider, request.providerApiKeyEnv);
  const model = await resolveModel(request.provider, request.model, {
    apiKeyEnv: request.providerApiKeyEnv,
  });

  if (request.outputSchema) {
    const result = await generateObject({
      model: model as Parameters<typeof generateObject>[0]['model'],
      prompt: request.prompt,
      schema: jsonSchema(request.outputSchema),
      output: 'object',
      schemaName: request.outputSchemaName,
      schemaDescription: request.outputSchemaDescription,
      abortSignal: request.signal,
    });
    return {
      adapter: 'vercel-ai-sdk',
      backend: 'api',
      operation: 'generateObject',
      mode: 'object',
      output: result.object,
      textOutput: serializeForMarkdown(result.object),
      request: result.request,
      response: result.response,
      usage: result.usage,
      finishReason: result.finishReason,
      warnings: result.warnings,
      providerMetadata: result.providerMetadata,
    };
  }

  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]['model'],
    prompt: request.prompt,
    abortSignal: request.signal,
  });

  return {
    adapter: 'vercel-ai-sdk',
    backend: 'api',
    operation: 'generateText',
    mode: 'text',
    output: result.text,
    textOutput: result.text,
    request: result.request,
    response: result.response,
    usage: result.usage,
    finishReason: result.finishReason,
    warnings: result.warnings,
    providerMetadata: result.providerMetadata,
  };
}

async function completeCli(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
  if (!request.cli) {
    throw new Error('CLI backend requires cli invocation config.');
  }

  const cliRequest = request as LlmCompleteRequest & {
    cli: NonNullable<LlmCompleteRequest['cli']>;
  };
  const cliConfig = resolveCliInvocation(cliRequest);
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(cliConfig.executable, cliConfig.args, {
      cwd: cliConfig.cwd,
      env: cliConfig.env,
      signal: cliRequest.signal,
      timeout: cliConfig.timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', chunk => {
      stdoutChunks.push(chunk.toString());
    });

    child.stderr?.on('data', chunk => {
      stderrChunks.push(chunk.toString());
    });

    child.on('error', rejectPromise);
    child.on('close', (code, sig) => {
      exitCode = code;
      exitSignal = sig;
      resolvePromise();
    });
  });

  const stdout = stdoutChunks.join('');
  const stderr = stderrChunks.join('');
  const invocation = {
    backend: 'cli',
    node_id: cliRequest.nodeId,
    provider: cliRequest.provider,
    model: cliRequest.model,
    executable: cliConfig.executable,
    args: cliConfig.args,
    cwd: cliConfig.cwd,
    timeout_ms: cliConfig.timeoutMs,
    env_keys: cliConfig.envKeys,
  };

  const callError = buildCliFailure(exitCode, exitSignal, stderr);
  const structured = extractCliStructuredOutput(stdout, Boolean(cliRequest.outputSchema));
  return {
    adapter: 'subprocess-cli',
    backend: 'cli',
    operation: 'cli',
    mode: structured.mode,
    output: structured.output,
    textOutput: structured.textOutput,
    callError,
    cliInvocation: invocation,
    stdout,
    stderr,
    response: {
      exit_code: exitCode,
      exit_signal: exitSignal,
    },
  };
}

async function resolveModel(provider: string, model: string, providerSettings?: ProviderSettings): Promise<unknown> {
  const normalized = provider.toLowerCase();
  switch (normalized) {
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      return openai(model);
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(model);
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google(model);
    }
    case 'github':
    case 'copilot': {
      const { createCopilot } = await import('ai-sdk-provider-github');
      const oauthToken = providerSettings?.apiKeyEnv
        ? asNonEmptyString(process.env[providerSettings.apiKeyEnv])
        : undefined;
      const providerFactory = oauthToken
        ? createCopilot({ oauthToken })
        : createCopilot();
      return providerFactory(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

function applyProviderEnvOverrides(provider: string, apiKeyEnv?: string): void {
  if (!provider || !apiKeyEnv) {
    return;
  }

  const envValue = process.env[apiKeyEnv];
  if (!envValue) {
    return;
  }

  const providerEnvKey = mapProviderApiKeyEnv(provider);
  if (!providerEnvKey) {
    return;
  }

  if (!process.env[providerEnvKey]) {
    process.env[providerEnvKey] = envValue;
  }
}

function mapProviderApiKeyEnv(provider: string): ProviderEnvKey | undefined {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'openai') {
    return 'OPENAI_API_KEY';
  }
  if (normalized === 'anthropic') {
    return 'ANTHROPIC_API_KEY';
  }
  if (normalized === 'google' || normalized === 'gemini') {
    return 'GOOGLE_GENERATIVE_AI_API_KEY';
  }
  return undefined;
}

function resolveCliInvocation(request: LlmCompleteRequest & { cli: NonNullable<LlmCompleteRequest['cli']> }): {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  envKeys: string[];
  timeoutMs: number;
} {
  const envVars = {
    prompt: request.prompt,
    provider: request.provider,
    model: request.model,
    logs_root: request.cli.logsRoot,
    stage_dir: request.cli.stageDir,
    node_id: request.nodeId,
  };

  const timeoutMs = normalizePositiveInteger(request.cli.timeoutMs) ?? 120000;
  const cwd = asNonEmptyString(request.cli.cwd) ?? process.cwd();
  const env = { ...process.env };
  const envOverrides = parseCliEnv(request.cli.env, envVars);
  Object.assign(env, envOverrides);

  const rawCommand = asNonEmptyString(request.cli.command);
  if (rawCommand) {
    const command = interpolateTemplate(rawCommand, envVars);
    const shell = process.env.SHELL || '/bin/sh';
    return {
      executable: shell,
      args: ['-lc', command],
      cwd,
      env,
      envKeys: Object.keys(envOverrides),
      timeoutMs,
    };
  }

  const explicitExecutable = asNonEmptyString(request.cli.executable);
  const providerDefaults = defaultProviderCLI(request.provider, request.model, request.prompt);
  const executable = explicitExecutable || providerDefaults.executable;
  const explicitArgs = parseCliArgs(request.cli.args, envVars);
  const args = explicitArgs ?? providerDefaults.args;

  return {
    executable,
    args,
    cwd,
    env,
    envKeys: Object.keys(envOverrides),
    timeoutMs,
  };
}

async function* streamApiText(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
  applyProviderEnvOverrides(request.provider, request.providerApiKeyEnv);
  const model = await resolveModel(request.provider, request.model, {
    apiKeyEnv: request.providerApiKeyEnv,
  });
  const result = streamText({
    model: model as Parameters<typeof streamText>[0]['model'],
    prompt: request.prompt,
    abortSignal: request.signal,
  });

  let textOutput = '';
  for await (const delta of result.textStream) {
    textOutput += delta;
    if (!delta) {
      continue;
    }
    yield createStreamDeltaEvent(request, delta);
  }

  const streamResult: LlmCompleteResult = {
    adapter: 'vercel-ai-sdk',
    backend: 'api',
    operation: 'generateText',
    mode: 'text',
    output: textOutput,
    textOutput,
    request: await result.request,
    response: await result.response,
    usage: await result.totalUsage,
    finishReason: await result.finishReason,
    warnings: await result.warnings,
    providerMetadata: await result.providerMetadata,
  };

  yield {
    type: 'llm.stream.end',
    data: buildStreamEndData(request.nodeId, streamResult),
  };
}

async function* streamCli(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
  if (!request.cli) {
    throw new Error('CLI backend requires cli invocation config.');
  }

  const cliRequest = request as LlmStreamRequest & {
    cli: NonNullable<LlmStreamRequest['cli']>;
  };
  const cliConfig = resolveCliInvocation(cliRequest as LlmCompleteRequest & {
    cli: NonNullable<LlmCompleteRequest['cli']>;
  });
  const expectsStructuredOutput = Boolean(cliRequest.outputSchema);
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let pendingStdout = '';
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;

  const child = spawn(cliConfig.executable, cliConfig.args, {
    cwd: cliConfig.cwd,
    env: cliConfig.env,
    signal: cliRequest.signal,
    timeout: cliConfig.timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stderr?.on('data', chunk => {
    stderrChunks.push(chunk.toString());
  });

  const closePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    child.on('error', rejectPromise);
    child.on('close', (code, sig) => {
      exitCode = code;
      exitSignal = sig;
      resolvePromise();
    });
  });

  if (child.stdout) {
    for await (const chunk of child.stdout) {
      const chunkText = chunk.toString();
      stdoutChunks.push(chunkText);
      if (expectsStructuredOutput) {
        continue;
      }

      pendingStdout += chunkText;
      let newlineIndex = pendingStdout.indexOf('\n');
      while (newlineIndex >= 0) {
        const delta = pendingStdout.slice(0, newlineIndex + 1);
        pendingStdout = pendingStdout.slice(newlineIndex + 1);
        if (delta.length > 0) {
          yield createStreamDeltaEvent(request, delta);
        }
        newlineIndex = pendingStdout.indexOf('\n');
      }
    }
  }

  await closePromise;

  const stdout = stdoutChunks.join('');
  const stderr = stderrChunks.join('');
  const structured = extractCliStructuredOutput(stdout, expectsStructuredOutput);
  if (expectsStructuredOutput && structured.mode === 'object') {
    yield {
      type: 'llm.stream.object',
      data: {
        output: structured.output,
        text_output: structured.textOutput,
        timestamp: new Date().toISOString(),
      },
    };
  } else if (pendingStdout.length > 0) {
    yield createStreamDeltaEvent(request, pendingStdout);
  }

  const invocation = {
    backend: 'cli',
    node_id: cliRequest.nodeId,
    provider: cliRequest.provider,
    model: cliRequest.model,
    executable: cliConfig.executable,
    args: cliConfig.args,
    cwd: cliConfig.cwd,
    timeout_ms: cliConfig.timeoutMs,
    env_keys: cliConfig.envKeys,
  };
  const streamResult: LlmCompleteResult = {
    adapter: 'subprocess-cli',
    backend: 'cli',
    operation: 'cli',
    mode: structured.mode,
    output: structured.output,
    textOutput: structured.textOutput,
    callError: buildCliFailure(exitCode, exitSignal, stderr),
    cliInvocation: invocation,
    stdout,
    stderr,
    response: {
      exit_code: exitCode,
      exit_signal: exitSignal,
    },
  };

  yield {
    type: 'llm.stream.end',
    data: buildStreamEndData(request.nodeId, streamResult),
  };
}

function createStreamDeltaEvent(request: LlmStreamRequest, delta: string): LlmStreamEvent {
  return {
    type: 'llm.stream.delta',
    data: {
      node_id: request.nodeId,
      backend: request.backend,
      provider: request.provider,
      model: request.model,
      delta,
      timestamp: new Date().toISOString(),
    },
  };
}

function buildStreamEndData(nodeId: string, result: LlmCompleteResult): Record<string, unknown> {
  return {
    node_id: nodeId,
    adapter: result.adapter,
    backend: result.backend,
    operation: result.operation,
    mode: result.mode,
    output: result.output,
    text_output: result.textOutput,
    request: result.request,
    response: result.response,
    finish_reason: result.finishReason,
    usage: result.usage,
    warnings: result.warnings,
    provider_metadata: result.providerMetadata,
    cli_invocation: result.cliInvocation,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.callError,
    timestamp: new Date().toISOString(),
  };
}

function parseCliEnv(value: unknown, vars: Record<string, string>): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }

  const parsed = typeof value === 'string' ? parseJsonInput(value, 'cli_env') : value;
  if (!isRecord(parsed)) {
    throw new Error('cli_env must be a JSON object');
  }

  const env: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(parsed)) {
    env[key] = interpolateTemplate(String(rawValue), vars);
  }
  return env;
}

function parseCliArgs(value: unknown, vars: Record<string, string>): string[] | null {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = typeof value === 'string' ? parseJsonInput(value, 'cli_args') : value;
  if (!Array.isArray(parsed)) {
    throw new Error('cli_args must be a JSON array');
  }

  return parsed.map(arg => interpolateTemplate(String(arg), vars));
}

function parseJsonInput(input: string, sourceName: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`${sourceName} cannot be empty`);
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${sourceName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function interpolateTemplate(input: string, vars: Record<string, string>): string {
  return input.replace(/\{([a-z_]+)\}/gi, (_match, key: string) => {
    const normalized = key.toLowerCase();
    return vars[normalized] ?? '';
  });
}

function defaultProviderCLI(provider: string, model: string, prompt: string): {
  executable: string;
  args: string[];
} {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'openai') {
    return {
      executable: 'codex',
      args: ['exec', '--json', '--sandbox', 'workspace-write', '--model', model, prompt],
    };
  }
  if (normalized === 'anthropic') {
    return {
      executable: 'claude',
      args: ['-p', '--output-format', 'stream-json', '--model', model, prompt],
    };
  }
  if (normalized === 'google' || normalized === 'gemini') {
    return {
      executable: 'gemini',
      args: ['-p', '--output-format', 'stream-json', '--model', model, '--yolo', prompt],
    };
  }

  throw new Error(`No default CLI mapping for provider "${provider}"`);
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function buildCliFailure(
  exitCode: number | null,
  exitSignal: NodeJS.Signals | null,
  stderr: string
): string | undefined {
  if (exitCode === 0 && !exitSignal) {
    return undefined;
  }
  const reason = exitSignal ? `signal ${exitSignal}` : `exit code ${exitCode ?? 'unknown'}`;
  const stderrTail = stderr.trim().slice(-400);
  return stderrTail
    ? `CLI codergen failed (${reason}): ${stderrTail}`
    : `CLI codergen failed (${reason})`;
}

function extractCliStructuredOutput(
  stdout: string,
  expectsStructuredOutput: boolean
): { mode: 'text' | 'object'; output: unknown; textOutput: string } {
  const trimmed = stdout.trim();
  if (expectsStructuredOutput) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isRecord(parsed) || Array.isArray(parsed)) {
        return {
          mode: 'object',
          output: parsed,
          textOutput: serializeForMarkdown(parsed),
        };
      }
    } catch {
      // keep text fallback below
    }
  }

  return {
    mode: 'text',
    output: trimmed,
    textOutput: trimmed,
  };
}

function serializeForMarkdown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
