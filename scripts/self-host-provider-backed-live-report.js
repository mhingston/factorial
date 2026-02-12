#!/usr/bin/env node

import { generateText } from 'ai';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-provider-backed-live-latest.json',
);

const REQUIRED_PROVIDERS = ['openai', 'anthropic'];
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 64;
const DEFAULT_MAX_TOTAL_TOKENS = 600;
const DEFAULT_FRESHNESS_SLA_HOURS = 168;

const PROVIDER_CONFIG = {
  openai: {
    id: 'PBL-001',
    name: 'OpenAI minimal bounded live probe',
    envKey: 'OPENAI_API_KEY',
    defaultModel: DEFAULT_OPENAI_MODEL,
  },
  anthropic: {
    id: 'PBL-002',
    name: 'Anthropic minimal bounded live probe',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: DEFAULT_ANTHROPIC_MODEL,
  },
};

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    requirePass: false,
    probeMode: 'live',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    maxTotalTokens: DEFAULT_MAX_TOTAL_TOKENS,
    openaiModel: DEFAULT_OPENAI_MODEL,
    anthropicModel: DEFAULT_ANTHROPIC_MODEL,
    mockOpenai: '',
    mockAnthropic: '',
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--require-pass') {
      args.requirePass = true;
      continue;
    }
    if (arg === '--probe-mode' && argv[index + 1]) {
      args.probeMode = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms' && argv[index + 1]) {
      args.timeoutMs = parseBoundedInteger(argv[index + 1], 1_000, 120_000, DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }
    if (arg === '--max-output-tokens' && argv[index + 1]) {
      args.maxOutputTokens = parseBoundedInteger(argv[index + 1], 1, 256, DEFAULT_MAX_OUTPUT_TOKENS);
      index += 1;
      continue;
    }
    if (arg === '--max-total-tokens' && argv[index + 1]) {
      args.maxTotalTokens = parseBoundedInteger(argv[index + 1], 1, 4096, DEFAULT_MAX_TOTAL_TOKENS);
      index += 1;
      continue;
    }
    if (arg === '--openai-model' && argv[index + 1]) {
      args.openaiModel = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--anthropic-model' && argv[index + 1]) {
      args.anthropicModel = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--mock-openai' && argv[index + 1]) {
      args.mockOpenai = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--mock-anthropic' && argv[index + 1]) {
      args.mockAnthropic = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function parseBoundedInteger(raw, min, max, fallback) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

function summarizeProbeStatuses(statuses) {
  const values = Object.values(statuses);
  if (values.length === 0 || values.every(status => status === 'skip')) {
    return 'skip';
  }
  if (values.some(status => status === 'fail')) {
    return 'fail';
  }
  return values.every(status => status === 'pass') ? 'pass' : 'fail';
}

function checkResult({ id, name, command, status, summary, evidence, details }) {
  return {
    id,
    level: 'provider-backed-live',
    name,
    command,
    status,
    summary,
    evidence,
    details,
  };
}

function resolveMockStatus(provider, options) {
  const raw = provider === 'openai' ? options.mockOpenai : options.mockAnthropic;
  const normalized = String(raw || '').toLowerCase().trim();
  if (normalized === 'pass' || normalized === 'fail' || normalized === 'skip') {
    return normalized;
  }
  return 'skip';
}

async function resolveProviderModel(provider, model) {
  if (provider === 'openai') {
    const { openai } = await import('@ai-sdk/openai');
    return openai(model);
  }
  if (provider === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic');
    return anthropic(model);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function runProviderProbe(provider, options) {
  const config = PROVIDER_CONFIG[provider];
  const model = provider === 'openai' ? options.openaiModel : options.anthropicModel;

  if (options.probeMode === 'mock') {
    const mockStatus = resolveMockStatus(provider, options);
    return checkResult({
      id: config.id,
      name: config.name,
      command: `mock provider probe (${provider})`,
      status: mockStatus,
      summary:
        mockStatus === 'pass'
          ? `Mock ${provider} probe marked pass.`
          : mockStatus === 'fail'
            ? `Mock ${provider} probe marked fail.`
            : `Mock ${provider} probe marked skip.`,
      evidence: [],
      details: {
        provider,
        mode: 'mock',
        model,
        timeout_ms: options.timeoutMs,
        max_output_tokens: options.maxOutputTokens,
        max_total_tokens: options.maxTotalTokens,
      },
    });
  }

  if (!process.env[config.envKey]) {
    return checkResult({
      id: config.id,
      name: config.name,
      command: `live provider probe (${provider})`,
      status: 'skip',
      summary: `${provider} live probe skipped because ${config.envKey} is not set.`,
      evidence: [],
      details: {
        provider,
        mode: 'live',
        model,
        reason: 'missing_provider_api_key',
        required_env_key: config.envKey,
      },
    });
  }

  let resolvedModel;
  try {
    resolvedModel = await resolveProviderModel(provider, model);
  } catch (error) {
    return checkResult({
      id: config.id,
      name: config.name,
      command: `live provider probe (${provider})`,
      status: 'skip',
      summary: `${provider} live probe skipped because provider package is unavailable.`,
      evidence: [],
      details: {
        provider,
        mode: 'live',
        model,
        reason: 'provider_package_unavailable',
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  const prompt = 'Reply with exactly: LIVE_CANARY_OK';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const startedAt = Date.now();

  try {
    const result = await generateText({
      model: resolvedModel,
      prompt,
      maxOutputTokens: options.maxOutputTokens,
      temperature: 0,
      maxRetries: 0,
      abortSignal: controller.signal,
    });

    const durationMs = Date.now() - startedAt;
    const usage = result.usage ?? {};
    const totalTokens =
      typeof usage.totalTokens === 'number'
        ? usage.totalTokens
        : typeof usage.inputTokens === 'number' && typeof usage.outputTokens === 'number'
          ? usage.inputTokens + usage.outputTokens
          : null;
    const textOutput = String(result.text ?? '');
    const sentinelOk = /LIVE_CANARY_OK/.test(textOutput);
    const tokenBudgetOk = totalTokens === null || totalTokens <= options.maxTotalTokens;
    const status = sentinelOk && tokenBudgetOk ? 'pass' : 'fail';

    return checkResult({
      id: config.id,
      name: config.name,
      command: `live provider probe (${provider})`,
      status,
      summary:
        status === 'pass'
          ? `${provider} live probe succeeded within timeout/token bounds.`
          : `${provider} live probe completed but failed sentinel/token-bound checks.`,
      evidence: [],
      details: {
        provider,
        mode: 'live',
        model,
        timeout_ms: options.timeoutMs,
        max_output_tokens: options.maxOutputTokens,
        max_total_tokens: options.maxTotalTokens,
        duration_ms: durationMs,
        output_text: textOutput,
        sentinel_ok: sentinelOk,
        usage: {
          input_tokens: usage.inputTokens ?? null,
          output_tokens: usage.outputTokens ?? null,
          total_tokens: totalTokens,
        },
        token_budget_ok: tokenBudgetOk,
        finish_reason: result.finishReason ?? null,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return checkResult({
      id: config.id,
      name: config.name,
      command: `live provider probe (${provider})`,
      status: 'fail',
      summary: `${provider} live probe failed.`,
      evidence: [],
      details: {
        provider,
        mode: 'live',
        model,
        timeout_ms: options.timeoutMs,
        max_output_tokens: options.maxOutputTokens,
        max_total_tokens: options.maxTotalTokens,
        duration_ms: durationMs,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildReport(checks, reportPathContract, options) {
  const providerStatuses = {
    openai: checks.find(check => check.id === PROVIDER_CONFIG.openai.id)?.status ?? 'skip',
    anthropic: checks.find(check => check.id === PROVIDER_CONFIG.anthropic.id)?.status ?? 'skip',
  };
  const probeOverallStatus = summarizeProbeStatuses(providerStatuses);
  const policyMode = options.requirePass ? 'required' : 'advisory';
  const advisoryProbeFailures = Object.entries(providerStatuses)
    .filter(([, status]) => status === 'fail')
    .map(([provider]) => provider);
  const overallStatus =
    policyMode === 'required' ? (probeOverallStatus === 'pass' ? 'pass' : 'fail') : 'pass';

  const policyCheck = checkResult({
    id: 'PBL-900',
    name: 'Provider-backed live canary policy decision',
    command: 'policy evaluation',
    status: overallStatus,
    summary:
      policyMode === 'required'
        ? overallStatus === 'pass'
          ? 'Required live-canary policy satisfied for all required providers.'
          : 'Required live-canary policy failed because one or more required providers are not pass.'
        : 'Advisory mode active; non-pass probe outcomes are recorded without fail-closing.',
    evidence: [],
    details: {
      policy_mode: policyMode,
      probe_overall_status: probeOverallStatus,
      advisory_probe_failures: advisoryProbeFailures,
      provider_statuses: providerStatuses,
    },
  });

  return {
    schema_version: 'self_host_provider_backed_live_report.v1',
    generated_at: new Date().toISOString(),
    report_path: reportPathContract,
    publication: {
      command: 'npm run self-host:provider-backed-live',
      policy_mode: policyMode,
      required_providers: REQUIRED_PROVIDERS,
      probe_mode: options.probeMode,
      bounds: {
        timeout_ms: options.timeoutMs,
        max_output_tokens: options.maxOutputTokens,
        max_total_tokens: options.maxTotalTokens,
      },
      freshness_sla_hours: DEFAULT_FRESHNESS_SLA_HOURS,
    },
    summary: {
      overall_status: overallStatus,
      probe_overall_status: probeOverallStatus,
      policy_mode: policyMode,
      require_pass: options.requirePass,
      required_providers: REQUIRED_PROVIDERS,
      providers: providerStatuses,
      attempted_provider_count: Object.values(providerStatuses).filter(status => status !== 'skip').length,
      failed_provider_count: Object.values(providerStatuses).filter(status => status === 'fail').length,
      skipped_provider_count: Object.values(providerStatuses).filter(status => status === 'skip').length,
      advisory_probe_failures: advisoryProbeFailures,
      freshness_sla_hours: DEFAULT_FRESHNESS_SLA_HOURS,
    },
    checks: [...checks, policyCheck],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.probeMode !== 'live' && args.probeMode !== 'mock') {
    console.error(`Invalid --probe-mode "${args.probeMode}". Expected "live" or "mock".`);
    process.exit(1);
  }

  const reportPath = resolve(args.report);
  await mkdir(dirname(reportPath), { recursive: true });

  const checks = [];
  for (const provider of REQUIRED_PROVIDERS) {
    checks.push(await runProviderProbe(provider, args));
  }

  const report = buildReport(checks, toContractPath(reportPath), args);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`Self-host provider-backed live report written to ${reportPath}`);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Self-host provider-backed live report generation failed:', error);
  process.exit(1);
});
