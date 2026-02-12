import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { evaluateCondition } from '../conditions/index.js';
import { ExecutionCancelledError } from '../engine/index.js';
import type { ExecutionEngine } from '../engine/index.js';
import { createDefaultLlmAdapter } from '../llm/index.js';
import type { Context, Graph, Handler, LlmAdapter, Node, Outcome } from '../types/index.js';
import { WorktreeManager, type WorktreeMergeStrategy } from '../worktree/index.js';

/**
 * Start handler - no-op entry point
 */
export class StartHandler implements Handler {
  async execute(_node: Node, _context: Context, _graph: Graph, _logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    return {
      status: 'SUCCESS',
      context_updates: {},
    };
  }
}

/**
 * Exit handler - no-op exit point
 */
export class ExitHandler implements Handler {
  async execute(_node: Node, _context: Context, _graph: Graph, _logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    return {
      status: 'SUCCESS',
      context_updates: {},
    };
  }
}

/**
 * Conditional handler - routing point
 */
export class ConditionalHandler implements Handler {
  async execute(node: Node, _context: Context, _graph: Graph, _logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    return {
      status: 'SUCCESS',
      context_updates: {},
      notes: `Conditional node evaluated: ${node.id}`,
    };
  }
}

/**
 * Codergen handler - executes LLM tasks
 */
type StageStatus = Outcome['status'];
type OutputMode = 'text' | 'object';
type StructuredOutputMode = 'auto' | 'json' | 'tool';
type CodergenBackend = 'api' | 'cli';
type CodergenOperation = 'generateText' | 'generateObject' | 'cli';
type ValidationResult = 'pass' | 'fail' | 'skipped';
type FanInMergeStrategy = 'best_score' | 'consensus' | 'arbiter';
type FanInMergeTiebreak = 'weight' | 'lexical' | 'latest';
type QualityGateType = 'tests' | 'lint' | 'typecheck' | 'security' | 'custom';
type FailureClass = 'transient' | 'quality_gap' | 'tool_error' | 'spec_mismatch';
type ConfidenceDecision = 'autonomous' | 'escalate';

interface OutputSchemaConfig {
  rawSchema: unknown;
  schema: Record<string, unknown>;
  mode: StructuredOutputMode;
  schemaName?: string;
  schemaDescription?: string;
  source: 'inline' | 'file';
  sourcePath?: string;
}

interface CodergenCallResult {
  adapter: string;
  backend: CodergenBackend;
  operation: CodergenOperation;
  mode: OutputMode;
  output: unknown;
  textOutput: string;
  callError?: string;
  request?: unknown;
  response?: unknown;
  usage?: unknown;
  finishReason?: unknown;
  warnings?: unknown;
  providerMetadata?: unknown;
  cliInvocation?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
}

interface CodergenEvent {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

interface CodergenValidationState {
  output_contract_required: boolean;
  schema_configured: boolean;
  schema_source: 'inline' | 'file' | 'none';
  schema_path?: string;
  checked: boolean;
  result: ValidationResult;
  errors: string[];
}

interface CodergenUsageSummary {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
}

interface StructuredOutputValidationResult {
  checked: boolean;
  result: ValidationResult;
  errors: string[];
  callError?: string;
}

interface ProviderSettings {
  apiKeyEnv?: string;
  defaultModel?: string;
}

const DEFAULT_JUDGE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    overall_score: { type: 'number' },
    sub_scores: {
      type: 'object',
      additionalProperties: {
        type: 'number',
      },
    },
    rationale: { type: 'string' },
  },
  required: ['overall_score', 'sub_scores', 'rationale'],
};

const DEFAULT_FAILURE_ANALYZE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    failure_class: {
      type: 'string',
      enum: ['transient', 'quality_gap', 'tool_error', 'spec_mismatch'],
    },
    summary: { type: 'string' },
    recommendation: { type: 'string' },
  },
  required: ['failure_class', 'summary'],
};

export class CodergenHandler implements Handler {
  private llmAdapter: LlmAdapter;

  constructor(llmAdapter?: LlmAdapter) {
    this.llmAdapter = llmAdapter ?? createDefaultLlmAdapter();
  }

  async execute(
    node: Node,
    context: Context,
    _graph: Graph,
    logsRoot: string,
    signal?: AbortSignal
  ): Promise<Outcome> {
    assertNotCancelled(signal);
    const prompt = node.prompt || node.label || '';
    if (!prompt) {
      return {
        status: 'FAIL',
        failure_reason: 'No prompt or label provided',
        context_updates: {},
      };
    }

    const defaultProvider = await context.getString('config.default_provider', '');
    const configuredProvider = await context.getString('config.llm_provider', '');
    const provider = node.llm_provider || configuredProvider || defaultProvider;
    const providerSettings = await resolveProviderSettings(context, provider || '');
    const modelName =
      node.llm_model ||
      (await context.getString('config.llm_model', '')) ||
      providerSettings.defaultModel;
    const fidelity = (await context.getString('fidelity', 'compact')) || 'compact';

    if (!provider || !modelName) {
      return {
        status: 'FAIL',
        failure_reason: 'Missing llm_provider or llm_model',
        context_updates: {},
      };
    }

    try {
      const stageDir = join(logsRoot, node.id);
      await mkdir(stageDir, { recursive: true });

      const preamble = buildFidelityPreamble(fidelity, context, node);
      
      // Check for and drain steering messages (mid-task intervention)
      const steeringMessages = await context.drainSteeringQueue();
      let steeringSection = '';
      if (steeringMessages.length > 0) {
        const steeringContent = steeringMessages
          .map((msg, idx) => `[Steering ${idx + 1}/${steeringMessages.length}] ${msg.content}`)
          .join('\n');
        steeringSection = `\n\n---\n**Steering Messages:**\n${steeringContent}\n---`;
        
        // Write steering artifacts for audit trail
        const steeringPath = join(stageDir, 'steering.json');
        await writeJsonFile(steeringPath, {
          messages: steeringMessages,
          count: steeringMessages.length,
          node_id: node.id,
          timestamp: new Date().toISOString(),
        });
      }
      
      const fullPrompt = preamble 
        ? `${preamble}\n\n${prompt}${steeringSection}` 
        : `${prompt}${steeringSection}`;
      const promptPath = join(stageDir, 'prompt.md');
      await writeFile(promptPath, fullPrompt);

      const outputContractRequired = asBoolean(node.attributes.output_contract_required) ?? false;
      let schemaConfig: OutputSchemaConfig | null = null;
      let schemaConfigError: string | undefined;
      try {
        schemaConfig = await resolveOutputSchemaConfig(node);
      } catch (error) {
        schemaConfigError = error instanceof Error ? error.message : String(error);
      }

      const validation = createValidationState({
        outputContractRequired,
        schemaConfig,
      });
      const markValidationFailure = (message: string): void => {
        validation.result = 'fail';
        validation.checked = true;
        validation.errors.push(message);
      };

      if (schemaConfig) {
        const outputSchemaPath = join(stageDir, 'output_schema.json');
        await writeJsonFile(outputSchemaPath, {
          schema: schemaConfig.rawSchema,
          mode: schemaConfig.mode,
          schema_name: schemaConfig.schemaName ?? '',
          schema_description: schemaConfig.schemaDescription ?? '',
          source: schemaConfig.source,
          source_path: schemaConfig.sourcePath ?? '',
        });
        validation.schema_path = outputSchemaPath;
      }

      if (schemaConfigError) {
        markValidationFailure(schemaConfigError);
      }

      if (outputContractRequired && !schemaConfig) {
        markValidationFailure(
          'output_contract_required=true requires output_schema or output_schema_path'
        );
      }

      const backend = await resolveCodergenBackend(node, context);
      const artifactUpdates: Record<string, unknown> = {};
      let events: CodergenEvent[] = [];
      if (validation.schema_path) {
        artifactUpdates[`codergen.${node.id}.output_schema_path`] = validation.schema_path;
      }

      let callResult: CodergenCallResult = {
        adapter: backend === 'api' ? 'vercel-ai-sdk' : 'subprocess-cli',
        backend,
        operation: backend === 'api' ? (schemaConfig ? 'generateObject' : 'generateText') : 'cli',
        mode: schemaConfig ? 'object' : 'text',
        output: schemaConfig ? {} : '',
        textOutput: '',
      };

      if (validation.result !== 'fail' && backend === 'api') {
        const operation: CodergenOperation = schemaConfig ? 'generateObject' : 'generateText';
        const apiRequestPath = join(stageDir, 'api_request.json');
        await writeJsonFile(apiRequestPath, {
          adapter: 'vercel-ai-sdk',
          backend: 'api',
          operation,
          node_id: node.id,
          provider,
          model: modelName,
          fidelity,
          reasoning_effort: node.reasoning_effort,
          prompt: fullPrompt,
          output_schema: schemaConfig?.rawSchema,
          output_mode: schemaConfig?.mode,
          timestamp: new Date().toISOString(),
        });
        artifactUpdates[`codergen.${node.id}.api_request_path`] = apiRequestPath;

        events.push({
          type: 'api.request',
          timestamp: new Date().toISOString(),
          node_id: node.id,
          provider,
          model: modelName,
          operation,
          status: 'started',
        });

        const callStart = Date.now();
        try {
          callResult = await this.llmAdapter.complete({
            backend: 'api',
            nodeId: node.id,
            provider,
            model: modelName,
            prompt: fullPrompt,
            providerApiKeyEnv: providerSettings.apiKeyEnv,
            outputSchema: schemaConfig?.schema ?? null,
            outputSchemaName: schemaConfig?.schemaName,
            outputSchemaDescription: schemaConfig?.schemaDescription,
            outputMode: schemaConfig?.mode,
            signal,
          });
        } catch (error) {
          callResult = {
            adapter: 'vercel-ai-sdk',
            backend: 'api',
            operation,
            mode: schemaConfig ? 'object' : 'text',
            output: schemaConfig ? {} : '',
            textOutput: '',
            callError: error instanceof Error ? error.message : String(error),
          };
        }
        const durationMs = Date.now() - callStart;

        const apiResponsePath = join(stageDir, 'api_response.json');
        await writeJsonFile(apiResponsePath, {
          adapter: callResult.adapter,
          backend: 'api',
          operation,
          node_id: node.id,
          provider,
          model: modelName,
          finish_reason: callResult.finishReason ?? '',
          usage: callResult.usage ?? {},
          warnings: callResult.warnings ?? [],
          provider_metadata: callResult.providerMetadata ?? {},
          request: callResult.request ?? {},
          response: callResult.response ?? {},
          output_mode: callResult.mode,
          output: callResult.output,
        });
        artifactUpdates[`codergen.${node.id}.api_response_path`] = apiResponsePath;

        events.push({
          type: 'api.response',
          timestamp: new Date().toISOString(),
          node_id: node.id,
          provider,
          model: modelName,
          operation,
          status: callResult.callError ? 'failed' : 'completed',
          duration_ms: durationMs,
          error: callResult.callError ?? '',
        });
      } else if (validation.result !== 'fail') {
        const callStart = Date.now();
        try {
          callResult = await this.llmAdapter.complete({
            backend: 'cli',
            nodeId: node.id,
            provider,
            model: modelName,
            prompt: fullPrompt,
            outputSchema: schemaConfig?.schema ?? null,
            outputMode: schemaConfig?.mode,
            cli: {
              command: node.attributes.cli_command,
              executable: node.attributes.cli_executable,
              args: node.attributes.cli_args,
              env: node.attributes.cli_env,
              cwd: node.attributes.cli_cwd,
              timeoutMs: node.attributes.cli_timeout_ms ?? node.timeout ?? 120000,
              logsRoot,
              stageDir,
            },
            signal,
          });
        } catch (error) {
          callResult = {
            adapter: 'subprocess-cli',
            backend: 'cli',
            operation: 'cli',
            mode: schemaConfig ? 'object' : 'text',
            output: schemaConfig ? {} : '',
            textOutput: '',
            callError: error instanceof Error ? error.message : String(error),
          };
        }
        const durationMs = Date.now() - callStart;

        const invocationPath = join(stageDir, 'cli_invocation.json');
        const stdoutPath = join(stageDir, 'stdout.log');
        const stderrPath = join(stageDir, 'stderr.log');
        await writeJsonFile(invocationPath, callResult.cliInvocation ?? {});
        await writeFile(stdoutPath, callResult.stdout ?? '');
        await writeFile(stderrPath, callResult.stderr ?? '');
        artifactUpdates[`codergen.${node.id}.cli_invocation_path`] = invocationPath;
        artifactUpdates[`codergen.${node.id}.stdout_path`] = stdoutPath;
        artifactUpdates[`codergen.${node.id}.stderr_path`] = stderrPath;

        events = buildCliEvents({
          nodeId: node.id,
          provider,
          modelName,
          stdout: callResult.stdout ?? '',
          stderr: callResult.stderr ?? '',
          durationMs,
          failed: Boolean(callResult.callError),
          error: callResult.callError,
        });
      }

      artifactUpdates[`codergen.${node.id}.adapter`] = callResult.adapter;
      artifactUpdates[`codergen.${node.id}.backend`] = callResult.backend;
      artifactUpdates[`codergen.${node.id}.operation`] = callResult.operation;
      artifactUpdates[`codergen.${node.id}.provider`] = provider;
      artifactUpdates[`codergen.${node.id}.model`] = modelName;
      artifactUpdates[`codergen.${node.id}.reasoning_effort`] = node.reasoning_effort;
      artifactUpdates[`codergen.${node.id}.output_mode`] = callResult.mode;
      if (callResult.finishReason !== undefined) {
        artifactUpdates[`codergen.${node.id}.finish_reason`] = callResult.finishReason;
      }

      const structuredValidation = validateStructuredOutput(callResult, schemaConfig);
      if (structuredValidation.checked) {
        validation.checked = true;
        validation.result = structuredValidation.result;
        validation.errors = [...validation.errors, ...structuredValidation.errors];
      }
      if (structuredValidation.callError && !callResult.callError) {
        callResult.callError = structuredValidation.callError;
      }
      if (validation.result === 'fail' && !callResult.callError) {
        callResult.callError = validation.errors.join('; ');
      }

      const streamTranscript = buildCodergenStreamTranscript({
        nodeId: node.id,
        backend: callResult.backend,
        provider,
        model: modelName,
        callResult,
      });
      const streamTranscriptPath = join(stageDir, 'stream_transcript.json');
      const streamTranscriptNdjsonPath = join(stageDir, 'stream_transcript.ndjson');
      await writeStreamTranscriptArtifacts(
        streamTranscriptPath,
        streamTranscriptNdjsonPath,
        streamTranscript
      );
      artifactUpdates[`codergen.${node.id}.stream_transcript_path`] = streamTranscriptPath;
      artifactUpdates[`codergen.${node.id}.stream_transcript_ndjson_path`] = streamTranscriptNdjsonPath;

      const usageSummary = extractCodergenUsageSummary(callResult);
      if (usageSummary) {
        const usagePath = join(stageDir, 'usage.json');
        await writeJsonFile(usagePath, usageSummary);
        artifactUpdates[`codergen.${node.id}.usage_path`] = usagePath;
        if (usageSummary.input_tokens !== undefined) {
          artifactUpdates[`codergen.${node.id}.usage.input_tokens`] = usageSummary.input_tokens;
        }
        if (usageSummary.output_tokens !== undefined) {
          artifactUpdates[`codergen.${node.id}.usage.output_tokens`] = usageSummary.output_tokens;
        }
        if (usageSummary.total_tokens !== undefined) {
          artifactUpdates[`codergen.${node.id}.usage.total_tokens`] = usageSummary.total_tokens;
          artifactUpdates[`budget.${node.id}.tokens_used`] = usageSummary.total_tokens;
        }
        if (usageSummary.cost_usd !== undefined) {
          artifactUpdates[`codergen.${node.id}.usage.cost_usd`] = usageSummary.cost_usd;
          artifactUpdates[`budget.${node.id}.cost_usd`] = usageSummary.cost_usd;
        }
      }

      assertNotCancelled(signal);

      const responsePath = join(stageDir, 'response.md');
      await writeFile(responsePath, callResult.textOutput);
      await writeEventArtifacts(stageDir, events);
      const validationPath = join(stageDir, 'validation.json');
      await writeJsonFile(validationPath, validation);
      artifactUpdates[`codergen.${node.id}.validation_path`] = validationPath;
      artifactUpdates[`codergen.${node.id}.validation_result`] = validation.result;
      artifactUpdates[`codergen.${node.id}.validation_errors`] = validation.errors;
      artifactUpdates[`codergen.${node.id}.events_path`] = join(stageDir, 'events.ndjson');
      artifactUpdates[`codergen.${node.id}.events_json_path`] = join(stageDir, 'events.json');
      artifactUpdates[`codergen.${node.id}.response_path`] = responsePath;

      const outputPath = join(stageDir, 'output.json');
      if (callResult.callError) {
        const failOutcome: Outcome = {
          status: 'FAIL',
          context_updates: {
            [`codergen.${node.id}.prompt_path`]: promptPath,
            ...artifactUpdates,
          },
          notes: 'Codergen execution failed',
          failure_reason: callResult.callError,
        };
        await writeStatusFile(stageDir, failOutcome);
        await writeOutputFile(outputPath, {
          status: failOutcome.status,
          provider,
          model: modelName,
          reasoning_effort: node.reasoning_effort,
          fidelity,
          prompt_path: promptPath,
          response_path: responsePath,
          output_mode: callResult.mode,
          output: callResult.output,
          notes: failOutcome.notes,
          failure_reason: failOutcome.failure_reason,
          validation,
          usage: usageSummary,
        });
        (failOutcome.context_updates as Record<string, unknown>)[`codergen.${node.id}.status_path`] =
          join(stageDir, 'status.json');
        (failOutcome.context_updates as Record<string, unknown>)[`codergen.${node.id}.output_path`] = outputPath;
        return failOutcome;
      }

      const statusOutcome = await resolveCodergenOutcome(stageDir, logsRoot, node);
      if (!statusOutcome) {
        return {
          status: 'FAIL',
          failure_reason: 'Missing status.json and auto_status is disabled',
          context_updates: {},
        };
      }
      await writeOutputFile(outputPath, {
        status: statusOutcome.status,
        provider,
        model: modelName,
        reasoning_effort: node.reasoning_effort,
        fidelity,
        prompt_path: promptPath,
        response_path: responsePath,
        output_mode: callResult.mode,
        output: callResult.output,
        preferred_label: statusOutcome.preferred_label,
        suggested_next_ids: statusOutcome.suggested_next_ids,
        notes: statusOutcome.notes,
        failure_reason: statusOutcome.failure_reason,
        validation,
        usage: usageSummary,
      });

      const codergenUpdates = {
        [`codergen.${node.id}.output`]: callResult.mode === 'text' ? callResult.textOutput : callResult.output,
        [`codergen.${node.id}.prompt`]: fullPrompt,
        [`codergen.${node.id}.status`]: statusOutcome.status,
        [`codergen.${node.id}.adapter`]: callResult.adapter,
        [`codergen.${node.id}.backend`]: callResult.backend,
        [`codergen.${node.id}.operation`]: callResult.operation,
        [`codergen.${node.id}.provider`]: provider,
        [`codergen.${node.id}.model`]: modelName,
        [`codergen.${node.id}.reasoning_effort`]: node.reasoning_effort,
        [`codergen.${node.id}.output_mode`]: callResult.mode,
        [`codergen.${node.id}.prompt_path`]: promptPath,
        [`codergen.${node.id}.response_path`]: responsePath,
        [`codergen.${node.id}.status_path`]: join(stageDir, 'status.json'),
        [`codergen.${node.id}.output_path`]: outputPath,
        ...artifactUpdates,
      };

      if (callResult.mode === 'object') {
        (codergenUpdates as Record<string, unknown>)[`codergen.${node.id}.output_object`] = callResult.output;
      }

      return {
        status: statusOutcome.status,
        preferred_label: statusOutcome.preferred_label,
        suggested_next_ids: statusOutcome.suggested_next_ids,
        context_updates: { ...statusOutcome.context_updates, ...codergenUpdates },
        notes: statusOutcome.notes || 'Codergen complete',
        failure_reason: statusOutcome.failure_reason,
      };
    } catch (error) {
      if (error instanceof ExecutionCancelledError || isAbortError(error, signal)) {
        throw new ExecutionCancelledError();
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'FAIL',
        failure_reason: errorMessage,
        context_updates: {},
      };
    }
  }
}

function buildFidelityPreamble(fidelity: string, context: Context, node: Node): string {
  const snapshot = context.snapshot();
  const goal = snapshot['graph.goal'];
  const graphId = snapshot['graph.id'];
  const completedNodes = Array.isArray(snapshot['completed_nodes']) ? snapshot['completed_nodes'] : [];

  const headerLines = [
    `Graph: ${graphId ?? ''}`,
    `Goal: ${goal ?? ''}`,
    `Node: ${node.id}`,
    `Fidelity: ${fidelity}`,
    `Completed: ${completedNodes.join(', ') || '(none)'}`,
  ];

  if (fidelity === 'truncate') {
    return headerLines.join('\n');
  }

  // Normalize fidelity: 'summary' maps to 'summary:high' for backward compatibility
  const normalizedFidelity = fidelity === 'summary' ? 'summary:high' : fidelity;
  
  // Get all keys and prioritize them based on semantic importance
  const allKeys = Object.keys(snapshot);
  const prioritizedKeys = prioritizeContextKeys(allKeys);
  
  // Determine limit based on fidelity mode per Attractor spec Section 5.4
  let limit: number;
  switch (normalizedFidelity) {
    case 'full':
      limit = prioritizedKeys.length; // All keys
      break;
    case 'summary:high':
      limit = Math.min(60, prioritizedKeys.length); // High-level summaries
      break;
    case 'summary:low':
      limit = Math.min(10, prioritizedKeys.length); // Minimal critical context
      break;
    case 'compact':
    default:
      limit = Math.min(25, prioritizedKeys.length); // Balanced selection
  }
  
  const selectedKeys = prioritizedKeys.slice(0, limit);
  const entries = selectedKeys.map(key => `${key}: ${JSON.stringify(snapshot[key])}`);

  return `${headerLines.join('\n')}\n\nContext:\n${entries.join('\n')}`;
}

/**
 * Prioritize context keys by semantic importance for fidelity modes.
 * Critical system keys come first, followed by node outputs, then general context.
 */
function prioritizeContextKeys(keys: string[]): string[] {
  // Define key categories in priority order
  const criticalPrefixes = [
    'graph.', // Graph-level configuration
    'outcome', // Last outcome
    'preferred_label', // Routing decisions
    'last_', // Recent outputs
    'codergen.', // LLM generation results
    'budget.', // Budget tracking
    'internal.retry_count', // Retry state
  ];
  
  const highPrefixes = [
    'parallel.', // Parallel execution results
    'stack.', // Subagent/supervisor state
    'human.gate.', // Human interaction state
    'work.', // Work item context
    'context.', // Semantic context
  ];
  
  const lowPrefixes = [
    'config.', // Configuration (usually static)
    'internal.', // Internal bookkeeping
    'logs', // Log entries (verbose)
  ];
  
  // Score each key
  const scored = keys.map(key => {
    let score = 0;
    
    // Check critical prefixes (highest priority)
    for (const prefix of criticalPrefixes) {
      if (key.startsWith(prefix) || key === prefix) {
        score += 100;
        break;
      }
    }
    
    // Check high prefixes
    for (const prefix of highPrefixes) {
      if (key.startsWith(prefix)) {
        score += 50;
        break;
      }
    }
    
    // Check low prefixes (deprioritize)
    for (const prefix of lowPrefixes) {
      if (key.startsWith(prefix)) {
        score -= 30;
        break;
      }
    }
    
    // Recent activity indicators get slight boost
    if (key.includes('last_') || key.includes('current_') || key.includes('recent_')) {
      score += 10;
    }
    
    return { key, score };
  });
  
  // Sort by score descending, then alphabetically for stable ordering
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.key.localeCompare(b.key);
  });
  
  return scored.map(s => s.key);
}

async function resolveCodergenOutcome(
  stageDir: string,
  logsRoot: string,
  node: Node
): Promise<Outcome | null> {
  if (node.auto_status) {
    const autoOutcome: Outcome = {
      status: 'SUCCESS',
      context_updates: {},
      notes: 'auto-status: handler completed without status.json',
    };
    await writeStatusFile(stageDir, autoOutcome);
    return autoOutcome;
  }

  const stageStatusPath = join(stageDir, 'status.json');
  const rootStatusPath = join(logsRoot, 'status.json');

  const statusPayload = (await readStatusFile(stageStatusPath)) ?? (await readStatusFile(rootStatusPath));
  if (!statusPayload) {
    return null;
  }

  const raw = statusPayload.status ?? statusPayload.outcome ?? statusPayload.result;
  if (typeof raw !== 'string') {
    return null;
  }

  const status = normalizeStatus(raw);
  if (!status) return null;

  const preferred_label =
    typeof statusPayload.preferred_label === 'string' ? statusPayload.preferred_label : undefined;
  const suggested_next_ids = Array.isArray(statusPayload.suggested_next_ids)
    ? statusPayload.suggested_next_ids.map(String)
    : undefined;
  const notes = typeof statusPayload.notes === 'string' ? statusPayload.notes : undefined;
  const failure_reason =
    typeof statusPayload.failure_reason === 'string' ? statusPayload.failure_reason : undefined;
  const context_updates =
    statusPayload.context_updates && typeof statusPayload.context_updates === 'object'
      ? (statusPayload.context_updates as Record<string, unknown>)
      : {};

  return {
    status,
    preferred_label,
    suggested_next_ids,
    context_updates,
    notes,
    failure_reason,
  };
}

async function readStatusFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await readFile(path, 'utf-8');
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeStatus(value: string): StageStatus | null {
  const normalized = value.trim().toUpperCase();
  const map: Record<string, StageStatus> = {
    SUCCESS: 'SUCCESS',
    SUCCESSFUL: 'SUCCESS',
    FAIL: 'FAIL',
    FAILED: 'FAIL',
    FAILURE: 'FAIL',
    PARTIAL: 'PARTIAL_SUCCESS',
    PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
    PARTIAL_SUCCESSFUL: 'PARTIAL_SUCCESS',
    RETRY: 'RETRY',
    SKIPPED: 'SKIPPED',
  };
  return map[normalized] ?? null;
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ExecutionCancelledError();
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  return /aborted|aborterror|execution cancelled/i.test(error.message);
}

async function resolveOutputSchemaConfig(node: Node): Promise<OutputSchemaConfig | null> {
  const rawPath = asNonEmptyString(node.attributes.output_schema_path);
  const rawInline = node.attributes.output_schema;
  let rawSchema: unknown;
  let source: 'inline' | 'file' = 'inline';
  let sourcePath: string | undefined;

  if (rawPath) {
    const resolvedPath = resolve(rawPath);
    const fileContents = await readFile(resolvedPath, 'utf-8');
    rawSchema = parseOutputSchemaInput(fileContents, 'output_schema_path');
    source = 'file';
    sourcePath = resolvedPath;
  } else if (rawInline !== undefined) {
    rawSchema = parseOutputSchemaInput(rawInline, 'output_schema');
    source = 'inline';
  } else {
    return null;
  }

  if (!isRecord(rawSchema)) {
    throw new Error('output_schema must evaluate to a JSON object');
  }

  return {
    rawSchema,
    schema: rawSchema,
    mode: normalizeStructuredOutputMode(node.attributes.output_mode),
    schemaName: asNonEmptyString(node.attributes.output_schema_name),
    schemaDescription: asNonEmptyString(node.attributes.output_schema_description),
    source,
    sourcePath,
  };
}

function parseOutputSchemaInput(input: unknown, sourceName: string): unknown {
  if (isRecord(input)) {
    return input;
  }

  if (typeof input !== 'string') {
    throw new Error(`${sourceName} must be a JSON object or JSON string`);
  }

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

function normalizeStructuredOutputMode(value: unknown): StructuredOutputMode {
  if (typeof value !== 'string') return 'auto';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'json' || normalized === 'tool' || normalized === 'auto') {
    return normalized;
  }
  throw new Error(`Invalid output_mode "${value}". Expected auto, json, or tool.`);
}

async function resolveCodergenBackend(node: Node, context: Context): Promise<CodergenBackend> {
  const nodeBackend =
    asNonEmptyString(node.attributes.llm_backend) ??
    asNonEmptyString(node.attributes.codergen_backend) ??
    asNonEmptyString(node.attributes.backend);
  const configBackend = asNonEmptyString(await context.getString('config.llm_backend', ''));
  const raw = (nodeBackend || configBackend || 'api').toLowerCase();
  if (raw === 'api' || raw === 'cli') {
    return raw;
  }
  throw new Error(`Invalid llm backend "${raw}". Expected api or cli.`);
}

async function resolveProviderSettings(context: Context, provider: string): Promise<ProviderSettings> {
  if (!provider) {
    return {};
  }

  const providersValue = await context.get<unknown>('config.providers', {});
  if (!isRecord(providersValue)) {
    return {};
  }

  const providerKey = provider.trim();
  const providerValue =
    providersValue[providerKey] ??
    providersValue[providerKey.toLowerCase()] ??
    providersValue[providerKey.toUpperCase()];
  if (!isRecord(providerValue)) {
    return {};
  }

  return {
    apiKeyEnv: asNonEmptyString(providerValue.api_key_env),
    defaultModel: asNonEmptyString(providerValue.default_model),
  };
}

function validateStructuredOutput(
  callResult: CodergenCallResult,
  schemaConfig: OutputSchemaConfig | null
) : StructuredOutputValidationResult {
  if (!schemaConfig || callResult.callError) {
    return {
      checked: false,
      result: 'skipped',
      errors: [],
    };
  }

  if (callResult.mode !== 'object') {
    return {
      checked: true,
      result: 'fail',
      errors: ['Structured output schema is configured, but backend output was not valid JSON object/array.'],
      callError: 'Structured output schema is configured, but backend output was not valid JSON object/array.',
    };
  }

  const errors = validateJsonSchemaValue(callResult.output, schemaConfig.schema, '$');
  if (errors.length === 0) {
    return {
      checked: true,
      result: 'pass',
      errors: [],
    };
  }

  return {
    checked: true,
    result: 'fail',
    errors: errors.slice(0, 3),
    callError: `Structured output failed schema validation: ${errors.slice(0, 3).join('; ')}`,
  };
}

function createValidationState(options: {
  outputContractRequired: boolean;
  schemaConfig: OutputSchemaConfig | null;
}): CodergenValidationState {
  return {
    output_contract_required: options.outputContractRequired,
    schema_configured: Boolean(options.schemaConfig),
    schema_source: options.schemaConfig?.source ?? 'none',
    schema_path: options.schemaConfig?.sourcePath,
    checked: false,
    result: options.schemaConfig ? 'skipped' : options.outputContractRequired ? 'fail' : 'skipped',
    errors: [],
  };
}

function validateJsonSchemaValue(
  value: unknown,
  schema: unknown,
  path: string
): string[] {
  if (!isRecord(schema)) {
    return [];
  }

  const errors: string[] = [];

  const constValue = schema.const;
  if (constValue !== undefined && !deepEqual(value, constValue)) {
    errors.push(`${path}: expected const ${JSON.stringify(constValue)}`);
  }

  if (Array.isArray(schema.enum)) {
    const matchesEnum = schema.enum.some(candidate => deepEqual(value, candidate));
    if (!matchesEnum) {
      errors.push(`${path}: value is not one of enum options`);
    }
  }

  const schemaType = schema.type;
  if (!matchesSchemaType(value, schemaType)) {
    if (schemaType !== undefined) {
      const expected = Array.isArray(schemaType) ? schemaType.join('|') : String(schemaType);
      errors.push(`${path}: expected type ${expected}`);
    }
    return errors;
  }

  if (isRecord(value)) {
    const requiredFields = Array.isArray(schema.required)
      ? schema.required.filter(entry => typeof entry === 'string')
      : [];

    for (const key of requiredFields) {
      if (!(key in value)) {
        errors.push(`${path}.${key}: missing required property`);
      }
    }

    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(...validateJsonSchemaValue(value[key], childSchema, `${path}.${key}`));
      }
    }

    if (schema.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(properties));
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          errors.push(`${path}.${key}: additional properties are not allowed`);
        }
      }
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    for (let index = 0; index < value.length; index += 1) {
      errors.push(...validateJsonSchemaValue(value[index], schema.items, `${path}[${index}]`));
    }
  }

  if (typeof value === 'string') {
    const minLength = asFiniteNumber(schema.minLength);
    const maxLength = asFiniteNumber(schema.maxLength);
    if (minLength !== undefined && value.length < minLength) {
      errors.push(`${path}: string shorter than minLength=${minLength}`);
    }
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push(`${path}: string longer than maxLength=${maxLength}`);
    }
    if (typeof schema.pattern === 'string') {
      const regex = safeRegex(schema.pattern);
      if (regex && !regex.test(value)) {
        errors.push(`${path}: string does not match pattern`);
      }
    }
  }

  if (typeof value === 'number') {
    const minimum = asFiniteNumber(schema.minimum);
    const maximum = asFiniteNumber(schema.maximum);
    const exclusiveMinimum = asFiniteNumber(schema.exclusiveMinimum);
    const exclusiveMaximum = asFiniteNumber(schema.exclusiveMaximum);

    if (minimum !== undefined && value < minimum) {
      errors.push(`${path}: number smaller than minimum=${minimum}`);
    }
    if (maximum !== undefined && value > maximum) {
      errors.push(`${path}: number greater than maximum=${maximum}`);
    }
    if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
      errors.push(`${path}: number must be greater than ${exclusiveMinimum}`);
    }
    if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) {
      errors.push(`${path}: number must be less than ${exclusiveMaximum}`);
    }
  }

  return errors;
}

function matchesSchemaType(value: unknown, schemaType: unknown): boolean {
  if (schemaType === undefined) {
    return true;
  }

  if (Array.isArray(schemaType)) {
    return schemaType.some(entry => matchesSingleSchemaType(value, entry));
  }

  return matchesSingleSchemaType(value, schemaType);
}

function matchesSingleSchemaType(value: unknown, schemaType: unknown): boolean {
  if (typeof schemaType !== 'string') {
    return true;
  }

  switch (schemaType) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function extractCodergenUsageSummary(callResult: CodergenCallResult): CodergenUsageSummary | null {
  const usage = isRecord(callResult.usage) ? callResult.usage : {};
  const metadata = isRecord(callResult.providerMetadata) ? callResult.providerMetadata : {};
  const usageMetadata = isRecord(metadata.usage) ? metadata.usage : {};
  const costMetadata = isRecord(metadata.cost) ? metadata.cost : {};

  const inputTokens = firstFiniteNumber(
    usage.input_tokens,
    usage.inputTokens,
    usage.prompt_tokens,
    usage.promptTokens,
    usage.input,
    usageMetadata.input_tokens,
    usageMetadata.inputTokens
  );
  const outputTokens = firstFiniteNumber(
    usage.output_tokens,
    usage.outputTokens,
    usage.completion_tokens,
    usage.completionTokens,
    usage.output,
    usageMetadata.output_tokens,
    usageMetadata.outputTokens
  );
  const totalTokens = firstFiniteNumber(
    usage.total_tokens,
    usage.totalTokens,
    usage.total,
    usageMetadata.total_tokens,
    usageMetadata.totalTokens,
    inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined
  );
  const costUsd = firstFiniteNumber(
    usage.cost_usd,
    usage.costUsd,
    usage.total_cost_usd,
    usage.totalCostUsd,
    metadata.cost_usd,
    metadata.costUsd,
    costMetadata.usd,
    costMetadata.total_usd
  );

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    costUsd === undefined
  ) {
    return null;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cost_usd: costUsd,
  };
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function buildCliEvents(options: {
  nodeId: string;
  provider: string;
  modelName: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  failed: boolean;
  error?: string;
}): CodergenEvent[] {
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const events: CodergenEvent[] = [
    {
      type: 'cli.request',
      timestamp: startedAt,
      node_id: options.nodeId,
      provider: options.provider,
      model: options.modelName,
      operation: 'cli',
      status: 'started',
    },
  ];

  for (const [stream, content] of [
    ['stdout', options.stdout],
    ['stderr', options.stderr],
  ] as Array<[string, string]>) {
    for (const line of content.split('\n').map(entry => entry.trim()).filter(Boolean)) {
      events.push({
        type: 'cli.event',
        timestamp: finishedAt,
        node_id: options.nodeId,
        stream,
        line,
      });
    }
  }

  events.push({
    type: 'cli.response',
    timestamp: finishedAt,
    node_id: options.nodeId,
    provider: options.provider,
    model: options.modelName,
    operation: 'cli',
    status: options.failed ? 'failed' : 'completed',
    duration_ms: options.durationMs,
    error: options.error ?? '',
  });
  return events;
}

function buildCodergenStreamTranscript(options: {
  nodeId: string;
  backend: CodergenBackend;
  provider: string;
  model: string;
  callResult: CodergenCallResult;
}): CodergenEvent[] {
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const transcript: CodergenEvent[] = [
    {
      type: 'llm.stream.start',
      timestamp: startedAt,
      node_id: options.nodeId,
      backend: options.backend,
      provider: options.provider,
      model: options.model,
    },
  ];

  if (options.callResult.mode === 'object') {
    transcript.push({
      type: 'llm.stream.object',
      timestamp: finishedAt,
      node_id: options.nodeId,
      output: options.callResult.output,
      text_output: options.callResult.textOutput,
    });
  } else {
    const deltas = splitDeterministicTranscriptDeltas(options.callResult.textOutput);
    for (const delta of deltas) {
      transcript.push({
        type: 'llm.stream.delta',
        timestamp: finishedAt,
        node_id: options.nodeId,
        backend: options.backend,
        provider: options.provider,
        model: options.model,
        delta,
      });
    }
  }

  transcript.push({
    type: 'llm.stream.end',
    timestamp: finishedAt,
    node_id: options.nodeId,
    adapter: options.callResult.adapter,
    backend: options.callResult.backend,
    operation: options.callResult.operation,
    mode: options.callResult.mode,
    output: options.callResult.output,
    text_output: options.callResult.textOutput,
    finish_reason: options.callResult.finishReason,
    usage: options.callResult.usage,
    warnings: options.callResult.warnings,
    provider_metadata: options.callResult.providerMetadata,
    request: options.callResult.request,
    response: options.callResult.response,
    cli_invocation: options.callResult.cliInvocation,
    stdout: options.callResult.stdout,
    stderr: options.callResult.stderr,
    error: options.callResult.callError,
  });

  return transcript;
}

function splitDeterministicTranscriptDeltas(text: string): string[] {
  if (!text) {
    return [];
  }

  const deltas: string[] = [];
  let remaining = text;
  let newlineIndex = remaining.indexOf('\n');
  while (newlineIndex >= 0) {
    deltas.push(remaining.slice(0, newlineIndex + 1));
    remaining = remaining.slice(newlineIndex + 1);
    newlineIndex = remaining.indexOf('\n');
  }
  if (remaining.length > 0) {
    deltas.push(remaining);
  }

  return deltas;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function writeJsonFile(path: string, payload: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(toSerializable(payload), null, 2));
}

function toSerializable(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    return String(value);
  }
}

async function writeEventArtifacts(stageDir: string, events: CodergenEvent[]): Promise<void> {
  await writeJsonFile(join(stageDir, 'events.json'), events);
  const ndjson = events.map(event => JSON.stringify(toSerializable(event))).join('\n');
  await writeFile(join(stageDir, 'events.ndjson'), `${ndjson}\n`);
}

async function writeStreamTranscriptArtifacts(
  transcriptPath: string,
  transcriptNdjsonPath: string,
  events: CodergenEvent[]
): Promise<void> {
  await writeJsonFile(transcriptPath, events);
  const ndjson = events.map(event => JSON.stringify(toSerializable(event))).join('\n');
  await writeFile(transcriptNdjsonPath, `${ndjson}\n`);
}

async function writeStatusFile(stageDir: string, outcome: Outcome): Promise<void> {
  const statusPath = join(stageDir, 'status.json');
  const payload = {
    status: outcome.status.toLowerCase(),
    preferred_label: outcome.preferred_label ?? '',
    suggested_next_ids: outcome.suggested_next_ids ?? [],
    context_updates: outcome.context_updates ?? {},
    notes: outcome.notes ?? '',
    failure_reason: outcome.failure_reason ?? '',
  };
  await writeFile(statusPath, JSON.stringify(payload, null, 2));
}

async function writeOutputFile(
  path: string,
  payload: {
    status: StageStatus;
    provider: string;
    model: string;
    reasoning_effort: Node['reasoning_effort'];
    fidelity: string;
    prompt_path: string;
    response_path: string;
    output_mode: OutputMode;
    output: unknown;
    preferred_label?: string;
    suggested_next_ids?: string[];
    notes?: string;
    failure_reason?: string;
    validation?: CodergenValidationState;
    usage?: CodergenUsageSummary | null;
  }
): Promise<void> {
  const outputPayload = {
    status: payload.status.toLowerCase(),
    provider: payload.provider,
    model: payload.model,
    reasoning_effort: payload.reasoning_effort,
    fidelity: payload.fidelity,
    prompt_path: payload.prompt_path,
    response_path: payload.response_path,
    output_mode: payload.output_mode,
    output: payload.output,
    preferred_label: payload.preferred_label ?? '',
    suggested_next_ids: payload.suggested_next_ids ?? [],
    notes: payload.notes ?? '',
    failure_reason: payload.failure_reason ?? '',
    validation_result: payload.validation?.result ?? 'skipped',
    validation_errors: payload.validation?.errors ?? [],
    validation: payload.validation ?? null,
    usage: payload.usage ?? null,
  };
  await writeFile(path, JSON.stringify(outputPayload, null, 2));
}

/**
 * Judge rubric handler - codergen alias with strict scoring contract.
 */
export class JudgeRubricHandler implements Handler {
  private codergenHandler: CodergenHandler;

  constructor(codergenHandler?: CodergenHandler) {
    this.codergenHandler = codergenHandler ?? new CodergenHandler();
  }

  async execute(
    node: Node,
    context: Context,
    graph: Graph,
    logsRoot: string,
    signal?: AbortSignal
  ): Promise<Outcome> {
    assertNotCancelled(signal);
    const rubricPath = asNonEmptyString(node.attributes.judge_rubric_path);
    if (!rubricPath) {
      return {
        status: 'FAIL',
        failure_reason: 'judge.rubric requires judge_rubric_path',
        context_updates: {},
      };
    }

    const scoreThreshold = asNumber(node.attributes.score_threshold);
    if (scoreThreshold === undefined) {
      return {
        status: 'FAIL',
        failure_reason: 'judge.rubric requires numeric score_threshold',
        context_updates: {},
      };
    }

    try {
      const resolvedRubricPath = resolve(rubricPath);
      const rubricText = await readFile(resolvedRubricPath, 'utf-8');
      const scoreWeights = parseOptionalObject(node.attributes.score_weights, 'score_weights');
      const basePrompt = node.prompt || node.label || 'Evaluate output against rubric.';
      const promptSegments = [basePrompt, `Rubric:\n${rubricText}`];
      if (scoreWeights) {
        promptSegments.push(`Score weights:\n${JSON.stringify(scoreWeights, null, 2)}`);
      }
      promptSegments.push(
        'Return valid JSON with fields overall_score (number), sub_scores (object), and rationale (string).'
      );

      const delegatedNode: Node = {
        ...node,
        type: 'codergen',
        prompt: promptSegments.join('\n\n'),
        attributes: {
          ...node.attributes,
          output_contract_required: true,
          output_mode: node.attributes.output_mode ?? 'json',
          output_schema: node.attributes.output_schema ?? DEFAULT_JUDGE_OUTPUT_SCHEMA,
        },
      };

      const outcome = await this.codergenHandler.execute(delegatedNode, context, graph, logsRoot, signal);
      const judgeContextUpdates = { ...outcome.context_updates };
      if (outcome.status !== 'SUCCESS' && outcome.status !== 'PARTIAL_SUCCESS') {
        return {
          ...outcome,
          context_updates: judgeContextUpdates,
        };
      }

      const outputObject = judgeContextUpdates[`codergen.${node.id}.output_object`];
      if (!isRecord(outputObject)) {
        return {
          status: 'FAIL',
          failure_reason: 'judge.rubric expected structured output object',
          context_updates: judgeContextUpdates,
        };
      }

      const score = resolveJudgeScore(outputObject);
      if (score === undefined) {
        return {
          status: 'FAIL',
          failure_reason: 'judge.rubric output missing numeric overall_score',
          context_updates: judgeContextUpdates,
        };
      }

      const passed = score >= scoreThreshold;
      judgeContextUpdates[`judge.${node.id}.score`] = score;
      judgeContextUpdates[`judge.${node.id}.score_threshold`] = scoreThreshold;
      judgeContextUpdates[`judge.${node.id}.passed`] = passed;
      judgeContextUpdates[`judge.${node.id}.rubric_path`] = resolvedRubricPath;
      judgeContextUpdates[`judge.${node.id}.score_weights`] = scoreWeights ?? {};

      if (passed) {
        return {
          status: 'SUCCESS',
          preferred_label: 'pass',
          suggested_next_ids: outcome.suggested_next_ids,
          context_updates: judgeContextUpdates,
          notes: `Judge passed: score ${score} >= threshold ${scoreThreshold}`,
        };
      }

      return {
        status: 'FAIL',
        preferred_label: 'revise',
        suggested_next_ids: outcome.suggested_next_ids,
        context_updates: judgeContextUpdates,
        notes: `Judge failed: score ${score} < threshold ${scoreThreshold}`,
        failure_reason: `Judge score ${score} below threshold ${scoreThreshold}`,
      };
    } catch (error) {
      if (error instanceof ExecutionCancelledError || isAbortError(error, signal)) {
        throw new ExecutionCancelledError();
      }
      return {
        status: 'FAIL',
        failure_reason: error instanceof Error ? error.message : String(error),
        context_updates: {},
      };
    }
  }
}

/**
 * Failure analyze handler - codergen alias that classifies failure mode for targeted retries.
 */
export class FailureAnalyzeHandler implements Handler {
  private codergenHandler: CodergenHandler;

  constructor(codergenHandler?: CodergenHandler) {
    this.codergenHandler = codergenHandler ?? new CodergenHandler();
  }

  async execute(
    node: Node,
    context: Context,
    graph: Graph,
    logsRoot: string,
    signal?: AbortSignal
  ): Promise<Outcome> {
    assertNotCancelled(signal);
    try {
      const classifierSchema = parseOptionalObject(
        node.attributes.retry_classifier_schema,
        'retry_classifier_schema'
      );
      const prompt = node.prompt || node.label || 'Analyze the failure and classify retry strategy.';
      const latestFailureReason = await context.getString('failure_reason', '');
      const promptSegments = [
        prompt,
        latestFailureReason ? `Latest failure reason: ${latestFailureReason}` : '',
        'Classify failure_class as one of: transient, quality_gap, tool_error, spec_mismatch.',
        'Return JSON containing failure_class, summary, and recommendation.',
      ].filter(Boolean);

      const delegatedNode: Node = {
        ...node,
        type: 'codergen',
        prompt: promptSegments.join('\n\n'),
        attributes: {
          ...node.attributes,
          output_contract_required: true,
          output_mode: node.attributes.output_mode ?? 'json',
          output_schema: node.attributes.output_schema ?? classifierSchema ?? DEFAULT_FAILURE_ANALYZE_SCHEMA,
        },
      };

      const outcome = await this.codergenHandler.execute(delegatedNode, context, graph, logsRoot, signal);
      if (outcome.status !== 'SUCCESS' && outcome.status !== 'PARTIAL_SUCCESS') {
        return outcome;
      }

      const contextUpdates = { ...outcome.context_updates };
      const outputObject = contextUpdates[`codergen.${node.id}.output_object`];
      if (!isRecord(outputObject)) {
        return {
          status: 'FAIL',
          failure_reason: 'failure.analyze expected structured output object',
          context_updates: contextUpdates,
        };
      }

      const failureClass = normalizeFailureClassValue(outputObject.failure_class ?? outputObject.class);
      if (!failureClass) {
        return {
          status: 'FAIL',
          failure_reason: 'failure.analyze output missing valid failure_class',
          context_updates: contextUpdates,
        };
      }

      const summary = asNonEmptyString(outputObject.summary) ?? '';
      const recommendation =
        asNonEmptyString(outputObject.recommendation) ??
        asNonEmptyString(outputObject.retry_recommendation) ??
        '';

      contextUpdates[`failure.analyze.${node.id}.class`] = failureClass;
      contextUpdates[`failure.analyze.${node.id}.summary`] = summary;
      contextUpdates[`failure.analyze.${node.id}.recommendation`] = recommendation;
      contextUpdates['failure.class'] = failureClass;
      contextUpdates['retry.class'] = failureClass;

      return {
        status: 'SUCCESS',
        context_updates: contextUpdates,
        notes: `failure.analyze classified ${failureClass}`,
      };
    } catch (error) {
      if (error instanceof ExecutionCancelledError || isAbortError(error, signal)) {
        throw new ExecutionCancelledError();
      }
      return {
        status: 'FAIL',
        failure_reason: error instanceof Error ? error.message : String(error),
        context_updates: {},
      };
    }
  }
}

/**
 * Tool handler - executes shell commands
 */
export class ToolHandler implements Handler {
  async execute(node: Node, _context: Context, _graph: Graph, _logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    const command = node.attributes.tool_command as string;
    
    if (!command) {
      return {
        status: 'FAIL',
        failure_reason: 'No tool_command specified',
        context_updates: {},
      };
    }

    try {
      // Import dynamically to avoid issues if not available
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      const timeout = node.timeout || 10000;
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        signal,
        cwd: process.cwd(),
      });
      assertNotCancelled(signal);

      const output = stdout + (stderr ? `\nstderr: ${stderr}` : '');

      return {
        status: 'SUCCESS',
        context_updates: {
          [`tool.${node.id}.output`]: output,
        },
        notes: `Tool completed: ${command}`,
      };
    } catch (error) {
      if (error instanceof ExecutionCancelledError || isAbortError(error, signal)) {
        throw new ExecutionCancelledError();
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'FAIL',
        failure_reason: errorMessage,
        context_updates: {},
      };
    }
  }
}

interface GateCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
}

/**
 * Quality gate handler - executes deterministic gate commands and normalizes pass/fail state.
 */
export class QualityGateHandler implements Handler {
  async execute(node: Node, context: Context, _graph: Graph, logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    const gateType = normalizeQualityGateType(node.attributes.gate_type);
    const command = resolveQualityGateCommand(node, gateType);
    if (!command) {
      return {
        status: 'FAIL',
        failure_reason: `No quality gate command configured for gate_type="${gateType}"`,
        context_updates: {},
      };
    }

    const stageDir = join(logsRoot, node.id);
    await mkdir(stageDir, { recursive: true });
    const stdoutPath = join(stageDir, 'stdout.log');
    const stderrPath = join(stageDir, 'stderr.log');
    const resultPath = join(stageDir, 'gate_result.json');

    try {
      const timeoutMs = node.timeout ?? 120000;
      const result = await runShellCommand(command, timeoutMs, signal);
      const rawPassed = result.exitCode === 0 && !result.exitSignal;

      const gatePrefix = `quality.gate.${node.id}`;
      const contextSnapshot = context.snapshot();
      const gateContextUpdates: Record<string, unknown> = {
        [`${gatePrefix}.gate_type`]: gateType,
        [`${gatePrefix}.command`]: command,
        [`${gatePrefix}.exit_code`]: result.exitCode ?? -1,
        [`${gatePrefix}.exit_signal`]: result.exitSignal ?? '',
        [`${gatePrefix}.raw_outcome`]: rawPassed ? 'pass' : 'fail',
        [`${gatePrefix}.raw_passed`]: rawPassed,
        [`${gatePrefix}.stdout_path`]: stdoutPath,
        [`${gatePrefix}.stderr_path`]: stderrPath,
        [`${gatePrefix}.result_path`]: resultPath,
      };

      const passCondition = asNonEmptyString(node.attributes.pass_condition);
      const evaluationOutcome: Outcome = {
        status: rawPassed ? 'SUCCESS' : 'FAIL',
        context_updates: {},
      };
      const effectiveContext = { ...contextSnapshot, ...gateContextUpdates };
      const conditionPassed = passCondition
        ? evaluateCondition(passCondition, evaluationOutcome, effectiveContext)
        : rawPassed;
      const finalStatus: StageStatus = conditionPassed ? 'SUCCESS' : 'FAIL';
      const failureTarget = asNonEmptyString(node.attributes.failure_target);

      await writeFile(stdoutPath, result.stdout);
      await writeFile(stderrPath, result.stderr);
      await writeJsonFile(resultPath, {
        node_id: node.id,
        gate_type: gateType,
        command,
        pass_condition: passCondition ?? '',
        raw_outcome: rawPassed ? 'pass' : 'fail',
        normalized_outcome: finalStatus === 'SUCCESS' ? 'pass' : 'fail',
        normalized_passed: finalStatus === 'SUCCESS',
        exit_code: result.exitCode,
        exit_signal: result.exitSignal ?? '',
        stdout_path: stdoutPath,
        stderr_path: stderrPath,
        failure_target: failureTarget ?? '',
        timestamp: new Date().toISOString(),
      });

      const normalizedUpdates = {
        ...gateContextUpdates,
        [`${gatePrefix}.normalized_outcome`]: finalStatus === 'SUCCESS' ? 'pass' : 'fail',
        [`${gatePrefix}.normalized_passed`]: finalStatus === 'SUCCESS',
      };

      return {
        status: finalStatus,
        suggested_next_ids: finalStatus === 'FAIL' && failureTarget ? [failureTarget] : undefined,
        context_updates: normalizedUpdates,
        notes: `Quality gate ${gateType}: ${finalStatus === 'SUCCESS' ? 'pass' : 'fail'}`,
        failure_reason: finalStatus === 'FAIL' ? `Quality gate failed: ${gateType}` : undefined,
      };
    } catch (error) {
      if (error instanceof ExecutionCancelledError || isAbortError(error, signal)) {
        throw new ExecutionCancelledError();
      }
      return {
        status: 'FAIL',
        failure_reason: error instanceof Error ? error.message : String(error),
        context_updates: {},
      };
    }
  }
}

/**
 * Confidence gate handler - routes to autonomous or wait.human paths using thresholded confidence.
 */
export class ConfidenceGateHandler implements Handler {
  async execute(node: Node, context: Context, graph: Graph, logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);

    const signalPath = asNonEmptyString(node.attributes.confidence_signal_path);
    if (!signalPath) {
      return {
        status: 'FAIL',
        failure_reason: 'confidence.gate requires confidence_signal_path',
        context_updates: {},
      };
    }

    const threshold = asNumber(node.attributes.escalation_threshold);
    if (threshold === undefined || threshold < 0 || threshold > 1) {
      return {
        status: 'FAIL',
        failure_reason: 'confidence.gate requires escalation_threshold in range [0,1]',
        context_updates: {},
      };
    }

    const contextSnapshot = context.snapshot();
    const observed = asNumber(contextSnapshot[signalPath]);
    if (observed === undefined) {
      return {
        status: 'FAIL',
        failure_reason: `confidence.gate missing numeric signal at "${signalPath}"`,
        context_updates: {},
      };
    }

    const decision: ConfidenceDecision = observed < threshold ? 'escalate' : 'autonomous';
    const escalationTarget = resolveConfidenceEscalationTarget(node, graph);
    if (decision === 'escalate' && !escalationTarget) {
      return {
        status: 'FAIL',
        failure_reason: 'confidence.gate requires a wait.human escalation target',
        context_updates: {},
      };
    }

    const stageDir = join(logsRoot, node.id);
    await mkdir(stageDir, { recursive: true });
    const resultPath = join(stageDir, 'confidence_result.json');
    await writeJsonFile(resultPath, {
      node_id: node.id,
      confidence_signal_path: signalPath,
      observed_confidence: observed,
      escalation_threshold: threshold,
      decision,
      escalation_target: escalationTarget ?? '',
      timestamp: new Date().toISOString(),
    });

    const contextUpdates: Record<string, unknown> = {
      [`confidence.${node.id}.signal_path`]: signalPath,
      [`confidence.${node.id}.observed`]: observed,
      [`confidence.${node.id}.threshold`]: threshold,
      [`confidence.${node.id}.decision`]: decision,
      [`confidence.${node.id}.escalation_target`]: escalationTarget ?? '',
      [`confidence.${node.id}.result_path`]: resultPath,
    };

    if (decision === 'escalate') {
      return {
        status: 'PARTIAL_SUCCESS',
        preferred_label: 'escalate',
        suggested_next_ids: escalationTarget ? [escalationTarget] : undefined,
        context_updates: contextUpdates,
        notes: `confidence.gate escalated: observed=${observed.toFixed(3)} threshold=${threshold.toFixed(3)}`,
      };
    }

    return {
      status: 'SUCCESS',
      preferred_label: 'autonomous',
      context_updates: contextUpdates,
      notes: `confidence.gate autonomous: observed=${observed.toFixed(3)} threshold=${threshold.toFixed(3)}`,
    };
  }
}

function normalizeQualityGateType(value: unknown): QualityGateType {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (!normalized) {
    return 'custom';
  }
  if (
    normalized === 'tests' ||
    normalized === 'lint' ||
    normalized === 'typecheck' ||
    normalized === 'security' ||
    normalized === 'custom'
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid gate_type "${String(value)}". Expected tests, lint, typecheck, security, or custom.`
  );
}

function resolveQualityGateCommand(node: Node, gateType: QualityGateType): string {
  const explicit = asNonEmptyString(node.attributes.gate_command) ?? asNonEmptyString(node.attributes.tool_command);
  if (explicit) {
    return explicit;
  }
  if (gateType === 'tests') {
    return 'npm run test:run';
  }
  if (gateType === 'lint') {
    return 'npm run lint';
  }
  if (gateType === 'typecheck') {
    return 'npm run typecheck';
  }
  if (gateType === 'security') {
    return 'npm audit --audit-level=high';
  }
  return '';
}

async function runShellCommand(
  command: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<GateCommandResult> {
  const shell = process.env.SHELL || '/bin/sh';
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(shell, ['-lc', command], {
      cwd: process.cwd(),
      env: process.env,
      signal,
      timeout: timeoutMs,
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

  return {
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
    exitCode,
    exitSignal,
  };
}

function resolveConfidenceEscalationTarget(node: Node, graph: Graph): string | null {
  const explicitTarget = asNonEmptyString(node.attributes.escalation_target);
  const outgoingEdges = graph.edges.filter(edge => edge.from === node.id);
  if (explicitTarget) {
    const hasEdge = outgoingEdges.some(edge => edge.to === explicitTarget);
    const targetNode = graph.nodes.get(explicitTarget);
    if (hasEdge && targetNode && isWaitHumanNode(targetNode)) {
      return explicitTarget;
    }
    return null;
  }

  const waitHumanEdges = outgoingEdges.filter(edge => {
    const targetNode = graph.nodes.get(edge.to);
    return Boolean(targetNode) && isWaitHumanNode(targetNode as Node);
  });

  if (waitHumanEdges.length !== 1) {
    return null;
  }

  return waitHumanEdges[0].to;
}

function isWaitHumanNode(node: Node): boolean {
  return node.type === 'wait.human' || node.shape === 'hexagon';
}

/**
 * Human-in-the-loop handler
 */
export interface HumanChoice {
  key: string;
  label: string;
  to: string;
}

export interface HumanInterviewer {
  ask(question: string, choices: HumanChoice[]): Promise<string>;
}

export class WaitForHumanHandler implements Handler {
  private interviewer: HumanInterviewer;

  constructor(interviewer: HumanInterviewer) {
    this.interviewer = interviewer;
  }

  async execute(node: Node, _context: Context, graph: Graph, _logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    // Get outgoing edges as choices
    const outgoingEdges = graph.edges.filter(e => e.from === node.id);
    
    if (outgoingEdges.length === 0) {
      return {
        status: 'FAIL',
        failure_reason: 'No outgoing edges for human gate',
        context_updates: {},
      };
    }

    // Build choices from edges
    const choices: HumanChoice[] = outgoingEdges.map(edge => ({
      key: this.parseAcceleratorKey(edge.label || edge.to),
      label: edge.label || edge.to,
      to: edge.to,
    }));

    const question = node.label || 'Select an option:';
    const selectedKey = await this.interviewer.ask(question, choices);
    assertNotCancelled(signal);
    
    const selected = choices.find(c => c.key === selectedKey) || choices[0];

    return {
      status: 'SUCCESS',
      suggested_next_ids: [selected.to],
      context_updates: {
        'human.gate.selected': selected.key,
        'human.gate.label': selected.label,
      },
    };
  }

  private parseAcceleratorKey(label: string): string {
    // Try [K] Label format
    const bracketMatch = label.match(/^\[([a-zA-Z])\]\s*/);
    if (bracketMatch) return bracketMatch[1].toUpperCase();
    
    // Try K) Label format
    const parenMatch = label.match(/^([a-zA-Z])\)\s*/);
    if (parenMatch) return parenMatch[1].toUpperCase();
    
    // Try K - Label format
    const dashMatch = label.match(/^([a-zA-Z])\s+-\s+/);
    if (dashMatch) return dashMatch[1].toUpperCase();
    
    // Default to first character
    return label.charAt(0).toUpperCase();
  }
}

/**
 * Parallel handler - fan out execution
 */
export class ParallelHandler implements Handler {
  private engine?: ExecutionEngine;

  constructor(engine?: ExecutionEngine) {
    this.engine = engine;
  }

  async execute(node: Node, context: Context, graph: Graph, logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    // Get outgoing edges as branches
    const branches = graph.edges.filter(e => e.from === node.id);
    
    if (branches.length === 0) {
      return {
        status: 'SUCCESS',
        context_updates: {},
      };
    }

    const parentEngine = this.engine;
    if (!parentEngine) {
      return {
        status: 'FAIL',
        failure_reason: 'Parallel handler requires engine support',
        context_updates: {},
      };
    }

    const joinPolicy = (node.attributes.join_policy as string) || 'wait_all';
    const errorPolicy = (node.attributes.error_policy as string) || 'continue';
    const mergePolicy = (node.attributes.merge_policy as string) || 'none';
    const maxParallel = Number.parseInt((node.attributes.max_parallel as string) || '4', 10);
    
    // Worktree isolation support
    const worktreeIsolation = asBoolean(node.attributes.worktree_isolation) ?? false;
    const worktreeBasePath = asNonEmptyString(node.attributes.worktree_base_path) ?? join(logsRoot, '.factorial', 'worktrees');
    const worktreeAllowDirty = asBoolean(node.attributes.worktree_allow_dirty) ?? false;
    
    let worktreeManager: WorktreeManager | undefined;
    
    if (worktreeIsolation) {
      const repoRoot = parentEngine.getCwd() ?? process.cwd();
      worktreeManager = new WorktreeManager({ basePath: worktreeBasePath, repoRoot });
      
      // Validate git repository
      const isGitRepo = await worktreeManager.isGitRepository();
      if (!isGitRepo) {
        return {
          status: 'FAIL',
          failure_reason: 'worktree_isolation requires execution within a git repository',
          context_updates: {},
        };
      }
      
      // Check for uncommitted changes
      if (!worktreeAllowDirty) {
        const hasChanges = await worktreeManager.hasUncommittedChanges();
        if (hasChanges) {
          return {
            status: 'FAIL',
            failure_reason: 'Uncommitted changes detected. Commit or stash changes before using worktree_isolation, or set worktree_allow_dirty=true',
            context_updates: {},
          };
        }
      }
    }
    const quorum = Number.parseFloat((node.attributes.quorum as string) || '0.5');
    const kValue = Number.parseInt((node.attributes.k as string) || '1', 10);
    const quorumThreshold = Number.isFinite(quorum) && quorum > 0 ? quorum : 0.5;
    const quorumNeeded = Math.max(1, Math.ceil(branches.length * quorumThreshold));

    // Import p-limit for concurrency control
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(maxParallel);
    let stopScheduling = false;
    let completedSuccesses = 0;
    let completedFailures = 0;
    const controllers = new Map<string, AbortController>();
    const abortControllers = () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
    };

    const shouldStop = () => {
      if (errorPolicy === 'fail_fast' && completedFailures > 0) {
        return true;
      }
      if (joinPolicy === 'first_success' && completedSuccesses > 0) {
        return true;
      }
      if (joinPolicy === 'k_of_n' && completedSuccesses >= kValue) {
        return true;
      }
      if (joinPolicy === 'quorum' && completedSuccesses >= quorumNeeded) {
        return true;
      }
      return false;
    };

    // Execute branches concurrently
    const results = await Promise.all(
      branches.map((branch, index) =>
        limit(async () => {
          if (stopScheduling) {
            return {
              status: 'SKIPPED' as StageStatus,
              score: 0,
              branch_id: branch.to,
              branch_label: branch.label || branch.to,
              branch_weight: branch.weight ?? 0,
              result_index: index,
            };
          }

          const controller = new AbortController();
          controllers.set(branch.to, controller);
          const branchContext = context.clone();
          const branchLogsRoot = `${logsRoot}/parallel/${node.id}/${branch.to}`;
          
          // Create worktree if isolation is enabled
          let worktreePath: string | undefined;
          if (worktreeManager) {
            try {
              const worktreeInfo = await worktreeManager.createWorktree(branch.to);
              worktreePath = worktreeInfo.path;
              await branchContext.set(`parallel.worktree.${branch.to}.path`, worktreePath);
              await branchContext.set(`parallel.worktree.${branch.to}.created_at`, worktreeInfo.createdAt);
            } catch (error) {
              return {
                status: 'FAIL' as StageStatus,
                score: 0,
                branch_id: branch.to,
                branch_label: branch.label || branch.to,
                branch_weight: branch.weight ?? 0,
                result_index: index,
                failure_reason: error instanceof Error ? error.message : 'Failed to create worktree',
              };
            }
          }
          
          const branchEngine = await parentEngine.createBranchEngine(branchContext, branchLogsRoot, worktreePath);
          const outcome = await branchEngine.runFromNode(branch.to, controller.signal);

          if (outcome.status === 'SUCCESS') {
            completedSuccesses += 1;
          } else if (outcome.status === 'FAIL') {
            completedFailures += 1;
          }

          if (shouldStop()) {
            stopScheduling = true;
            abortControllers();
          }

          return {
            status: outcome.status,
            score: resolveParallelBranchScore(outcome, branch.to),
            context: branchContext.snapshot(),
            branch_id: branch.to,
            branch_label: branch.label || branch.to,
            branch_weight: branch.weight ?? 0,
            result_index: index,
            worktree_path: worktreePath,
          };
        })
      )
    );
    
    // Store worktree manager in context for fan_in to use
    if (worktreeManager) {
      await context.set('parallel.worktree.manager', worktreeBasePath);
      await context.set('parallel.worktree.branches', branches.map(b => b.to));
    }

    // Evaluate join policy
    const effectiveResults = errorPolicy === 'ignore'
      ? results.filter(r => r.status !== 'FAIL')
      : results;
    const successCount = effectiveResults.filter(r => r.status === 'SUCCESS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    let finalStatus: Outcome['status'] = 'SUCCESS';
    
    switch (joinPolicy) {
      case 'wait_all':
        finalStatus = failCount === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS';
        break;
      case 'first_success':
        finalStatus = successCount > 0 ? 'SUCCESS' : 'FAIL';
        break;
      case 'k_of_n': {
        finalStatus = successCount >= kValue ? 'SUCCESS' : 'FAIL';
        break;
      }
      case 'quorum': {
        finalStatus = successCount >= quorumNeeded ? 'SUCCESS' : 'FAIL';
        break;
      }
    }

    if (errorPolicy === 'fail_fast' && failCount > 0) {
      finalStatus = 'FAIL';
    }

    if (errorPolicy === 'ignore' && successCount === 0) {
      finalStatus = 'FAIL';
    }

    // Store results in context
    await context.set('parallel.results', JSON.stringify(results));

    if (mergePolicy !== 'none') {
      const merged = selectMergeContext(effectiveResults, mergePolicy);
      if (merged) {
        await context.apply_updates(merged);
      }
    }

    return {
      status: finalStatus,
      context_updates: {},
    };
  }
}

function selectMergeContext(
  results: Array<{ status: StageStatus; score?: number; context?: Record<string, unknown>; branch_id?: string }>,
  mergePolicy: string
): Record<string, unknown> | null {
  if (results.length === 0) return null;

  if (mergePolicy === 'first_success') {
    const match = results.find(result => result.status === 'SUCCESS');
    return match?.context ?? null;
  }

  if (mergePolicy === 'all') {
    return results.reduce<Record<string, unknown>>((acc, result) => {
      if (result.context) {
        Object.assign(acc, result.context);
      }
      return acc;
    }, {});
  }

  if (mergePolicy === 'best') {
    const best = selectBestOutcome(results);
    return best?.context ?? null;
  }

  return null;
}

function selectBestOutcome(
  results: Array<{ status: StageStatus; score?: number; context?: Record<string, unknown>; branch_id?: string }>
): { status: StageStatus; score?: number; context?: Record<string, unknown>; branch_id?: string } | null {
  const outcomeRank: Record<StageStatus, number> = {
    SUCCESS: 0,
    PARTIAL_SUCCESS: 1,
    RETRY: 2,
    FAIL: 3,
    SKIPPED: 4,
  };

  const candidates = results.filter(result => result.status !== 'FAIL' && result.status !== 'SKIPPED');
  if (candidates.length === 0) {
    return null;
  }

  let best = candidates[0];
  let bestRank = outcomeRank[best.status] ?? 999;
  let bestScore = best.score ?? 0;

  for (let i = 1; i < candidates.length; i++) {
    const rank = outcomeRank[candidates[i].status] ?? 999;
    const score = candidates[i].score ?? 0;
    const branchId = candidates[i].branch_id || '';
    const bestBranchId = best.branch_id || '';

    if (
      rank < bestRank ||
      (rank === bestRank && score > bestScore) ||
      (rank === bestRank && score === bestScore && branchId && branchId < bestBranchId)
    ) {
      best = candidates[i];
      bestRank = rank;
      bestScore = score;
    }
  }

  return best;
}

function resolveParallelBranchScore(outcome: Outcome, branchId: string): number {
  const direct = asFiniteNumber(outcome.context_updates.parallel_score);
  if (direct !== undefined) {
    return direct;
  }

  const scoped = asFiniteNumber(outcome.context_updates[`parallel.${branchId}.score`]);
  if (scoped !== undefined) {
    return scoped;
  }

  return outcome.status === 'SUCCESS' ? 1 : 0;
}

/**
 * Fan-in handler - consolidate parallel results
 */
export class FanInHandler implements Handler {
  async execute(node: Node, context: Context, _graph: Graph, logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    const resultsJson = await context.get<string>('parallel.results');

    if (!resultsJson) {
      return {
        status: 'FAIL',
        failure_reason: 'No parallel results to evaluate',
        context_updates: {},
      };
    }

    try {
      const mergeStrategy = parseFanInMergeStrategy(node.attributes.merge_strategy);
      const mergeTiebreak = parseFanInMergeTiebreak(node.attributes.merge_tiebreak);
      const arbiterPrompt = asNonEmptyString(node.attributes.arbiter_prompt);
      if (mergeStrategy === 'arbiter' && !arbiterPrompt) {
        return {
          status: 'FAIL',
          failure_reason: 'merge_strategy=arbiter requires arbiter_prompt',
          context_updates: {},
        };
      }

      const parsedResults = JSON.parse(resultsJson);
      if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
        return {
          status: 'FAIL',
          failure_reason: 'Invalid parallel results',
          context_updates: {},
        };
      }

      const normalizedResults = normalizeFanInResults(parsedResults);
      const candidates = normalizedResults.filter(
        result => result.status !== 'FAIL' && result.status !== 'SKIPPED'
      );

      if (candidates.length === 0) {
        return {
          status: 'FAIL',
          failure_reason: 'All parallel branches failed',
          context_updates: {},
        };
      }

      let selected: FanInCandidate;
      let selectedOutput: unknown;
      let consensusCount = 0;

      if (mergeStrategy === 'consensus') {
        const consensus = selectConsensusCandidate(candidates, mergeTiebreak);
        selected = consensus.selected;
        selectedOutput = consensus.output;
        consensusCount = consensus.count;
      } else {
        selected = selectBestCandidate(candidates, mergeTiebreak);
        selectedOutput = selected.output ?? selected.context ?? null;
      }

      // Worktree merge support
      const worktreeMergeStrategy = (asNonEmptyString(node.attributes.worktree_merge_strategy) ?? 'fail') as WorktreeMergeStrategy;
      const worktreeBasePath = await context.get<string>('parallel.worktree.manager');
      const worktreeMergeResults: Array<{ branch_id: string; success: boolean; conflicts?: string[]; error?: string }> = [];
      
      if (worktreeBasePath) {
        const branchIdsJson = await context.get<string>('parallel.worktree.branches');
        const branchIds: string[] = branchIdsJson ? JSON.parse(branchIdsJson) : [];
        const repoRoot = process.cwd();
        const worktreeManager = new WorktreeManager({ basePath: worktreeBasePath, repoRoot });
        
        for (const branchId of branchIds) {
          const mergeResult = await worktreeManager.mergeWorktree(branchId, worktreeMergeStrategy);
          worktreeMergeResults.push({
            branch_id: branchId,
            success: mergeResult.success,
            conflicts: mergeResult.conflicts,
            error: mergeResult.error,
          });
          
          if (!mergeResult.success && worktreeMergeStrategy === 'fail') {
            return {
              status: 'FAIL',
              failure_reason: `Worktree merge failed for branch ${branchId}: ${mergeResult.error}`,
              context_updates: {
                'parallel.fan_in.worktree_merge_results': worktreeMergeResults,
              },
            };
          }
        }
        
        await worktreeManager.cleanupAll();
      }

      const stageDir = join(logsRoot, node.id);
      await mkdir(stageDir, { recursive: true });
      const artifactPath = join(stageDir, 'fan_in_decision.json');
      const branchScores = normalizedResults.map(result => ({
        index: result.index,
        branch_id: result.branch_id,
        branch_label: result.branch_label ?? '',
        status: result.status,
        score: result.score,
        weight: result.branch_weight,
        result_index: result.result_index,
      }));

      await writeJsonFile(artifactPath, {
        node_id: node.id,
        merge_strategy: mergeStrategy,
        merge_tiebreak: mergeTiebreak,
        arbiter_prompt: arbiterPrompt ?? '',
        branch_scores: branchScores,
        selected: {
          index: selected.index,
          branch_id: selected.branch_id,
          status: selected.status,
          score: selected.score,
        },
        selected_output: selectedOutput,
        consensus_count: consensusCount,
        worktree_merge_strategy: worktreeBasePath ? worktreeMergeStrategy : undefined,
        worktree_merge_results: worktreeMergeResults.length > 0 ? worktreeMergeResults : undefined,
        timestamp: new Date().toISOString(),
      });

      const notesByStrategy: Record<FanInMergeStrategy, string> = {
        best_score: `Selected winner by best_score: ${selected.branch_id}`,
        consensus: `Selected consensus output from ${selected.branch_id} (${consensusCount} matching branches)`,
        arbiter: `Selected winner by arbiter strategy: ${selected.branch_id}`,
      };

      return {
        status: selected.status,
        context_updates: {
          'parallel.fan_in.best_index': selected.index,
          'parallel.fan_in.best_id': selected.branch_id,
          'parallel.fan_in.best_status': selected.status,
          'parallel.fan_in.selected_index': selected.index,
          'parallel.fan_in.selected_id': selected.branch_id,
          'parallel.fan_in.selected_status': selected.status,
          'parallel.fan_in.selected_score': selected.score,
          'parallel.fan_in.selected_output': selectedOutput,
          'parallel.fan_in.branch_scores': branchScores,
          'parallel.fan_in.merge_strategy': mergeStrategy,
          'parallel.fan_in.merge_tiebreak': mergeTiebreak,
          'parallel.fan_in.consensus_count': consensusCount,
          'parallel.fan_in.artifact_path': artifactPath,
        },
        notes: notesByStrategy[mergeStrategy],
      };
    } catch (error) {
      return {
        status: 'FAIL',
        failure_reason: error instanceof Error ? error.message : 'Failed to parse parallel results',
        context_updates: {},
      };
    }
  }

}

interface FanInCandidate {
  index: number;
  status: StageStatus;
  score: number;
  branch_id: string;
  branch_label?: string;
  branch_weight: number;
  result_index: number;
  context?: Record<string, unknown>;
  output?: unknown;
}

function parseFanInMergeStrategy(value: unknown): FanInMergeStrategy {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (!normalized) {
    return 'best_score';
  }
  if (normalized === 'best_score' || normalized === 'consensus' || normalized === 'arbiter') {
    return normalized;
  }
  throw new Error(`Invalid merge_strategy "${String(value)}". Expected best_score, consensus, or arbiter.`);
}

function parseFanInMergeTiebreak(value: unknown): FanInMergeTiebreak {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (!normalized) {
    return 'lexical';
  }
  if (normalized === 'weight' || normalized === 'lexical' || normalized === 'latest') {
    return normalized;
  }
  throw new Error(`Invalid merge_tiebreak "${String(value)}". Expected weight, lexical, or latest.`);
}

function normalizeFanInResults(rawResults: unknown[]): FanInCandidate[] {
  return rawResults.map((entry, index) => {
    const result = isRecord(entry) ? entry : {};
    const status = normalizeStatus(asNonEmptyString(result.status) ?? '') ?? 'FAIL';
    const branchId = asNonEmptyString(result.branch_id) ?? `branch_${index}`;
    const score = asNumber(result.score) ?? (status === 'SUCCESS' ? 1 : 0);
    const branchWeight = asNumber(result.branch_weight) ?? 0;
    const resultIndex = asNumber(result.result_index) ?? index;
    const context = isRecord(result.context) ? result.context : undefined;
    return {
      index,
      status,
      score,
      branch_id: branchId,
      branch_label: asNonEmptyString(result.branch_label),
      branch_weight: branchWeight,
      result_index: resultIndex,
      context,
      output: result.output ?? context,
    };
  });
}

function selectBestCandidate(
  candidates: FanInCandidate[],
  mergeTiebreak: FanInMergeTiebreak
): FanInCandidate {
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    if (compareFanInCandidates(candidates[i], best, mergeTiebreak) < 0) {
      best = candidates[i];
    }
  }
  return best;
}

function selectConsensusCandidate(
  candidates: FanInCandidate[],
  mergeTiebreak: FanInMergeTiebreak
): { selected: FanInCandidate; output: unknown; count: number } {
  const groups = new Map<string, { count: number; selected: FanInCandidate; output: unknown }>();

  for (const candidate of candidates) {
    const output = candidate.output ?? null;
    const key = stableStringify(output);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { count: 1, selected: candidate, output });
      continue;
    }
    existing.count += 1;
    if (compareFanInCandidates(candidate, existing.selected, mergeTiebreak) < 0) {
      existing.selected = candidate;
      existing.output = output;
    }
  }

  let winner: { count: number; selected: FanInCandidate; output: unknown } | null = null;
  for (const group of groups.values()) {
    if (!winner) {
      winner = group;
      continue;
    }
    if (group.count > winner.count) {
      winner = group;
      continue;
    }
    if (
      group.count === winner.count &&
      compareFanInCandidates(group.selected, winner.selected, mergeTiebreak) < 0
    ) {
      winner = group;
    }
  }

  return winner ?? { selected: candidates[0], output: candidates[0].output ?? null, count: 1 };
}

function compareFanInCandidates(
  left: FanInCandidate,
  right: FanInCandidate,
  mergeTiebreak: FanInMergeTiebreak
): number {
  const outcomeRank: Record<StageStatus, number> = {
    SUCCESS: 0,
    PARTIAL_SUCCESS: 1,
    RETRY: 2,
    FAIL: 3,
    SKIPPED: 4,
  };

  const leftRank = outcomeRank[left.status] ?? 999;
  const rightRank = outcomeRank[right.status] ?? 999;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (mergeTiebreak === 'weight' && left.branch_weight !== right.branch_weight) {
    return right.branch_weight - left.branch_weight;
  }

  if (mergeTiebreak === 'latest' && left.result_index !== right.result_index) {
    return right.result_index - left.result_index;
  }

  const lexical = left.branch_id.localeCompare(right.branch_id);
  if (lexical !== 0) {
    return lexical;
  }

  return left.index - right.index;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function parseOptionalObject(
  value: unknown,
  fieldName: string
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === 'string' ? parseOutputSchemaInput(value, fieldName) : value;
  if (!isRecord(parsed)) {
    throw new Error(`${fieldName} must be a JSON object`);
  }
  return parsed;
}

function normalizeFailureClassValue(value: unknown): FailureClass | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'transient' ||
    normalized === 'quality_gap' ||
    normalized === 'tool_error' ||
    normalized === 'spec_mismatch'
  ) {
    return normalized;
  }
  return null;
}

function resolveJudgeScore(output: Record<string, unknown>): number | undefined {
  const overall = asNumber(output.overall_score);
  if (overall !== undefined) {
    return overall;
  }
  return asNumber(output.score);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

type ManagerAction = 'delegate' | 'observe' | 'steer' | 'wait';
type ManagerLockDecision = 'resolved' | 'reopen';

export interface ManagerChildExecutionRequest {
  manager_node_id: string;
  child_dotfile: string;
  child_status_key: string;
  child_outcome_key: string;
  child_lock_key: string;
  child_request_key: string;
  request: Record<string, unknown>;
  context_snapshot: Record<string, unknown>;
  logs_root: string;
}

export interface ManagerChildExecutionResult {
  child_status?: string;
  child_outcome?: string;
  child_lock_decision?: string;
  context_updates?: Record<string, unknown>;
  notes?: string;
}

export type ManagerChildExecutionAdapter = (
  request: ManagerChildExecutionRequest,
  signal?: AbortSignal
) => Promise<ManagerChildExecutionResult>;

interface ManagerLoopHandlerOptions {
  childExecutionAdapter?: ManagerChildExecutionAdapter;
}

interface ManagerCycleSnapshot {
  cycle: number;
  timestamp: string;
  child_status: string;
  child_outcome: string;
  child_lock: string;
  child_lock_valid: boolean;
  delegated: boolean;
  stop_condition_matched: boolean;
}

interface ManagerLoopArtifact {
  node_id: string;
  child_dotfile: string;
  started_at: string;
  completed_at: string;
  actions: ManagerAction[];
  poll_interval_ms: number;
  max_cycles: number;
  stop_condition: string;
  require_lock_decision: boolean;
  delegated: boolean;
  local_child_execution_enabled: boolean;
  local_child_execution_used: boolean;
  cycle_count: number;
  final_status: StageStatus;
  final_child_status: string;
  final_child_outcome: string;
  final_child_lock: string;
  failure_reason: string;
  cycles: ManagerCycleSnapshot[];
}

function parseManagerActions(value: unknown): ManagerAction[] {
  const allowed = new Set<ManagerAction>(['delegate', 'observe', 'steer', 'wait']);
  const rawValues: string[] = [];

  if (typeof value === 'string') {
    rawValues.push(...value.split(','));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        rawValues.push(item);
      }
    }
  }

  const normalized = Array.from(
    new Set(
      rawValues
        .map(item => item.trim().toLowerCase())
        .filter(item => allowed.has(item as ManagerAction))
    )
  ) as ManagerAction[];

  return normalized.length > 0 ? normalized : ['observe', 'wait'];
}

function parseManagerNumber(
  value: unknown,
  fallback: number,
  field: string,
  minimum: number
): { ok: true; value: number } | { ok: false; reason: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: fallback };
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return { ok: false, reason: `${field} must be a number >= ${minimum}` };
  }
  return { ok: true, value: Math.floor(parsed) };
}

function normalizeManagerOutcome(childOutcome: string): StageStatus {
  const normalized = childOutcome.trim().toLowerCase();
  if (normalized === 'success') return 'SUCCESS';
  if (normalized === 'partial_success') return 'PARTIAL_SUCCESS';
  if (normalized === 'fail' || normalized === 'failed') return 'FAIL';
  if (normalized === 'retry') return 'RETRY';
  if (normalized === 'skipped') return 'SKIPPED';
  return 'PARTIAL_SUCCESS';
}

function normalizeManagerTerminalStatus(childStatus: string, childOutcome: string): StageStatus {
  const normalizedStatus = childStatus.trim().toLowerCase();
  if (normalizedStatus === 'failed') {
    return 'FAIL';
  }
  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') {
    return 'SKIPPED';
  }
  return normalizeManagerOutcome(childOutcome);
}

function parseManagerLockDecision(
  value: string
): { valid: true; value: ManagerLockDecision | '' } | { valid: false; value: '' } {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return { valid: true, value: '' };
  }
  if (normalized === 'resolved' || normalized === 'reopen') {
    return { valid: true, value: normalized };
  }
  return { valid: false, value: '' };
}

function buildManagerConditionContext(
  cycle: number,
  maxCycles: number,
  childStatus: string,
  childOutcome: string,
  childLock: string
): Record<string, unknown> {
  return {
    cycle,
    max_cycles: maxCycles,
    child_status: childStatus,
    child_outcome: childOutcome,
    child_lock: childLock,
    stack: {
      child: {
        status: childStatus,
        outcome: childOutcome,
        lock_decision: childLock,
      },
    },
  };
}

async function writeManagerArtifact(path: string, payload: ManagerLoopArtifact): Promise<void> {
  await writeJsonFile(path, payload);
}

/**
 * Manager loop handler - supervisor pattern
 */
export class ManagerLoopHandler implements Handler {
  private childExecutionAdapter?: ManagerChildExecutionAdapter;

  constructor(options: ManagerLoopHandlerOptions = {}) {
    this.childExecutionAdapter = options.childExecutionAdapter;
  }

  async execute(node: Node, context: Context, _graph: Graph, logsRoot: string, signal?: AbortSignal): Promise<Outcome> {
    assertNotCancelled(signal);
    const childDotfile = node.attributes.stack_child_dotfile as string;
    const stopCondition = asNonEmptyString(node.attributes.manager_stop_condition) ?? '';
    const actions = parseManagerActions(node.attributes.manager_actions);
    const pollIntervalResult = parseManagerNumber(
      node.attributes.manager_poll_interval,
      45000,
      'manager_poll_interval',
      0
    );
    if (!pollIntervalResult.ok) {
      return {
        status: 'FAIL',
        failure_reason: pollIntervalResult.reason,
        context_updates: {},
      };
    }
    const maxCyclesResult = parseManagerNumber(
      node.attributes.manager_max_cycles,
      1000,
      'manager_max_cycles',
      1
    );
    if (!maxCyclesResult.ok) {
      return {
        status: 'FAIL',
        failure_reason: maxCyclesResult.reason,
        context_updates: {},
      };
    }
    const pollInterval = pollIntervalResult.value;
    const maxCycles = maxCyclesResult.value;

    const childStatusKey = asNonEmptyString(node.attributes.manager_child_status_key) ?? 'stack.child.status';
    const childOutcomeKey = asNonEmptyString(node.attributes.manager_child_outcome_key) ?? 'stack.child.outcome';
    const childLockKey =
      asNonEmptyString(node.attributes.manager_child_lock_key) ?? 'stack.child.lock_decision';
    const childDotfileKey =
      asNonEmptyString(node.attributes.manager_child_dotfile_key) ?? 'stack.child.dotfile';
    const childRequestKey = asNonEmptyString(node.attributes.manager_child_request_key) ?? 'stack.child.request';
    const requireLockDecision = asBoolean(node.attributes.manager_require_lock) ?? false;
    const localChildExecutionEnabled =
      asBoolean(node.attributes.manager_local_child_execution) ?? false;

    const stageDir = join(logsRoot, node.id);
    await mkdir(stageDir, { recursive: true });
    const artifactPath = join(stageDir, 'manager_loop.json');
    const startedAt = new Date().toISOString();

    if (!childDotfile) {
      return {
        status: 'FAIL',
        failure_reason: 'No stack_child_dotfile specified',
        context_updates: {},
      };
    }

    let delegated = false;
    let localChildExecutionUsed = false;
    let localChildNotes = '';
    let childRequestPayload: Record<string, unknown> | null = null;
    if (actions.includes('delegate')) {
      delegated = true;
      childRequestPayload = {
        manager_node_id: node.id,
        child_dotfile: childDotfile,
        requested_at: startedAt,
        actions,
        stop_condition: stopCondition,
      };
      await context.set(childDotfileKey, childDotfile);
      await context.set(childRequestKey, childRequestPayload);
      const currentStatus = await context.getString(childStatusKey, '');
      if (!currentStatus) {
        await context.set(childStatusKey, 'running');
      }
    }

    if (localChildExecutionEnabled) {
      if (!actions.includes('delegate')) {
        return {
          status: 'FAIL',
          failure_reason:
            'manager_local_child_execution=true requires manager_actions to include delegate.',
          context_updates: {},
        };
      }
      if (!this.childExecutionAdapter) {
        return {
          status: 'FAIL',
          failure_reason:
            'manager_local_child_execution=true requires a configured childExecutionAdapter.',
          context_updates: {},
        };
      }
      if (!childRequestPayload) {
        return {
          status: 'FAIL',
          failure_reason: 'Unable to build manager child request payload.',
          context_updates: {},
        };
      }

      assertNotCancelled(signal);
      const adapterResult = await this.childExecutionAdapter(
        {
          manager_node_id: node.id,
          child_dotfile: childDotfile,
          child_status_key: childStatusKey,
          child_outcome_key: childOutcomeKey,
          child_lock_key: childLockKey,
          child_request_key: childRequestKey,
          request: childRequestPayload,
          context_snapshot: context.snapshot(),
          logs_root: logsRoot,
        },
        signal
      );
      localChildExecutionUsed = true;
      localChildNotes = asNonEmptyString(adapterResult.notes) ?? '';
      if (isRecord(adapterResult.context_updates)) {
        await context.apply_updates(adapterResult.context_updates);
      }
      const adapterStatus = asNonEmptyString(adapterResult.child_status);
      if (adapterStatus) {
        await context.set(childStatusKey, adapterStatus);
      }
      const adapterOutcome = asNonEmptyString(adapterResult.child_outcome);
      if (adapterOutcome) {
        await context.set(childOutcomeKey, adapterOutcome);
      }
      if (adapterResult.child_lock_decision !== undefined) {
        await context.set(childLockKey, String(adapterResult.child_lock_decision));
      }
    }

    const cycles: ManagerCycleSnapshot[] = [];
    let lastChildStatus = '';
    let lastChildOutcome = '';
    let lastChildLock = '';
    let finalStatus: StageStatus = 'FAIL';
    let failureReason = '';
    let notes = '';
    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      const timestamp = new Date().toISOString();
      const childStatus = await context.getString(childStatusKey, '');
      const childOutcome = await context.getString(childOutcomeKey, '');
      const childLock = await context.getString(childLockKey, '');
      const parsedLockDecision = parseManagerLockDecision(childLock);
      const normalizedLockDecision = parsedLockDecision.valid ? parsedLockDecision.value : '';

      lastChildStatus = childStatus;
      lastChildOutcome = childOutcome;
      lastChildLock = normalizedLockDecision || childLock.trim();

      const syntheticOutcome: Outcome = {
        status: normalizeManagerOutcome(childOutcome),
        context_updates: {},
      };
      const stopConditionMatched = stopCondition
        ? evaluateCondition(
            stopCondition,
            syntheticOutcome,
            buildManagerConditionContext(cycle, maxCycles, childStatus, childOutcome, childLock)
          )
        : false;

      cycles.push({
        cycle,
        timestamp,
        child_status: childStatus,
        child_outcome: childOutcome,
        child_lock: normalizedLockDecision || childLock.trim(),
        child_lock_valid: parsedLockDecision.valid,
        delegated,
        stop_condition_matched: stopConditionMatched,
      });

      if (!parsedLockDecision.valid) {
        finalStatus = 'FAIL';
        failureReason = `Invalid child lock decision "${childLock}". Expected resolved or reopen.`;
        notes = 'Invalid child lock decision';
        break;
      }

      if (stopConditionMatched) {
        finalStatus = syntheticOutcome.status;
        notes = `Manager stop condition satisfied at cycle ${cycle}`;
        if (requireLockDecision && !normalizedLockDecision) {
          finalStatus = 'FAIL';
          failureReason = 'Child lock decision is required but missing.';
        } else if (normalizedLockDecision === 'reopen') {
          finalStatus = 'FAIL';
          failureReason = 'Child lock decision is reopen.';
        }
        break;
      }

      const normalizedChildStatus = childStatus.trim().toLowerCase();
      if (
        normalizedChildStatus === 'completed' ||
        normalizedChildStatus === 'failed' ||
        normalizedChildStatus === 'cancelled' ||
        normalizedChildStatus === 'canceled'
      ) {
        finalStatus = normalizeManagerTerminalStatus(childStatus, childOutcome);
        notes = `Child ${normalizedChildStatus}`;
        if (finalStatus === 'FAIL') {
          failureReason = `Child ${normalizedChildStatus}${
            childOutcome ? ` (${childOutcome.toLowerCase()})` : ''
          }`;
        }
        if (requireLockDecision && !normalizedLockDecision) {
          finalStatus = 'FAIL';
          failureReason = 'Child lock decision is required but missing.';
        } else if (normalizedLockDecision === 'reopen') {
          finalStatus = 'FAIL';
          failureReason = 'Child lock decision is reopen.';
        }
        break;
      }

      if (cycle === maxCycles) {
        finalStatus = 'FAIL';
        failureReason = `Max cycles exceeded (${maxCycles})`;
        break;
      }

      if (actions.includes('wait') && pollInterval > 0) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      assertNotCancelled(signal);
    }

    const completedAt = new Date().toISOString();
    const artifact: ManagerLoopArtifact = {
      node_id: node.id,
      child_dotfile: childDotfile,
      started_at: startedAt,
      completed_at: completedAt,
      actions,
      poll_interval_ms: pollInterval,
      max_cycles: maxCycles,
      stop_condition: stopCondition,
      require_lock_decision: requireLockDecision,
      delegated,
      local_child_execution_enabled: localChildExecutionEnabled,
      local_child_execution_used: localChildExecutionUsed,
      cycle_count: cycles.length,
      final_status: finalStatus,
      final_child_status: lastChildStatus,
      final_child_outcome: lastChildOutcome,
      final_child_lock: lastChildLock,
      failure_reason: failureReason,
      cycles,
    };
    await writeManagerArtifact(artifactPath, artifact);

    const contextUpdates: Record<string, unknown> = {
      'stack.manager_loop.artifact_path': artifactPath,
      'stack.manager_loop.cycle_count': cycles.length,
      'stack.manager_loop.delegated': delegated,
      'stack.manager_loop.local_child_execution': localChildExecutionUsed,
      'stack.manager_loop.last_child_status': lastChildStatus,
      'stack.manager_loop.last_child_outcome': lastChildOutcome,
      'stack.manager_loop.last_child_lock': lastChildLock,
      'stack.manager_loop.lock_decision': lastChildLock,
    };

    if (finalStatus !== 'FAIL') {
      return {
        status: finalStatus,
        context_updates: contextUpdates,
        notes: localChildNotes ? [notes, localChildNotes].filter(Boolean).join('; ') : notes,
      };
    }

    return {
      status: finalStatus,
      failure_reason: failureReason || 'Manager loop failed',
      context_updates: contextUpdates,
      notes: localChildNotes ? [notes, localChildNotes].filter(Boolean).join('; ') : notes,
    };
  }
}
