import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { createReferenceTwinRuntime } from './reference-runtime.js';
import {
  type DtuScenarioFixture,
  type FailureMode,
  type ScenarioSuite,
  dtuScenarioFixtureSchema,
  failureModeSchema,
  scenarioSuiteSchema,
} from './scenario-harness.js';

export const scenarioTemplateSchema = z.object({
  scenario_id: z.string().min(1),
  suite: scenarioSuiteSchema,
  description: z.string().min(1),
  twin_id: z.string().min(1),
  operation: z.string().min(1),
  input: z.record(z.unknown()),
  expected_status: z.enum(['success', 'error']),
  expected_output: z.record(z.unknown()).optional(),
  expected_error_code: z.string().optional(),
  expected_failure_mode: failureModeSchema.optional(),
  simulate: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
});

export type ScenarioTemplate = z.infer<typeof scenarioTemplateSchema>;

export interface ScenarioCurationOptions {
  fixturesRoot: string;
  template?: ScenarioTemplate;
  listOnly?: boolean;
  validateOnly?: boolean;
  twinFilter?: string;
  suiteFilter?: ScenarioSuite;
}

export interface ScenarioListEntry {
  scenario_id: string;
  suite: ScenarioSuite;
  twin_id: string;
  operation: string;
  description: string;
  path: string;
}

export interface ScenarioValidationResult {
  valid: boolean;
  errors: string[];
  fixture?: DtuScenarioFixture;
}

export interface CurationReport {
  action: 'list' | 'validate' | 'create';
  fixtures_root: string;
  entries: ScenarioListEntry[];
  validation_results?: ScenarioValidationResult[];
  created_fixture?: DtuScenarioFixture;
}

const TWIN_OPERATIONS: Record<string, string[]> = {
  'jira.issue': ['issues.create'],
  'slack.channel': ['messages.post'],
  'github.issue': ['issues.create', 'issues.add_comment', 'issues.close'],
  'aws.s3': ['buckets.create', 'objects.put', 'objects.get', 'objects.delete'],
  'database.records': ['records.insert', 'records.update', 'records.delete', 'records.query'],
};

const FAILURE_MODE_SIMULATIONS: Record<FailureMode, string[]> = {
  rate_limit: ['rate_limited'],
  auth_failure: ['auth_failed'],
  timeout: ['timeout'],
  malformed_payload: ['invalid_input'],
  partial_outage: ['partial_outage'],
};

export async function listScenarios(options: ScenarioCurationOptions): Promise<ScenarioListEntry[]> {
  const fixturesRoot = resolve(options.fixturesRoot);
  const entries: ScenarioListEntry[] = [];

  try {
    const files = await listJsonFiles(fixturesRoot);

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        const parsed = JSON.parse(content);

        if (parsed.scenario_id && parsed.suite && parsed.request?.twin_id) {
          const entry: ScenarioListEntry = {
            scenario_id: parsed.scenario_id,
            suite: parsed.suite,
            twin_id: parsed.request.twin_id,
            operation: parsed.request.operation,
            description: parsed.description || 'No description',
            path: file,
          };

          if (options.twinFilter && !entry.twin_id.includes(options.twinFilter)) {
            continue;
          }
          if (options.suiteFilter && entry.suite !== options.suiteFilter) {
            continue;
          }

          entries.push(entry);
        }
      } catch {
        // Skip invalid JSON files
      }
    }
  } catch {
    // Directory doesn't exist or is empty
  }

  return entries.sort((a, b) => a.scenario_id.localeCompare(b.scenario_id));
}

export async function validateScenarioTemplate(
  template: ScenarioTemplate
): Promise<ScenarioValidationResult> {
  const errors: string[] = [];

  const parseResult = scenarioTemplateSchema.safeParse(template);
  if (!parseResult.success) {
    errors.push(`Template validation failed: ${parseResult.error.message}`);
    return { valid: false, errors };
  }

  const validTemplate = parseResult.data;

  // Validate twin_id exists
  const runtime = createReferenceTwinRuntime();
  const availableTwins = runtime.listTwinIds();
  if (!availableTwins.includes(validTemplate.twin_id)) {
    errors.push(
      `Unknown twin_id: ${validTemplate.twin_id}. Available: ${availableTwins.join(', ')}`
    );
  }

  // Validate operation is supported
  const supportedOps = TWIN_OPERATIONS[validTemplate.twin_id] || [];
  if (!supportedOps.includes(validTemplate.operation)) {
    errors.push(
      `Unsupported operation '${validTemplate.operation}' for ${validTemplate.twin_id}. Supported: ${supportedOps.join(', ')}`
    );
  }

  // Validate expected output matches status
  if (validTemplate.expected_status === 'success' && validTemplate.expected_error_code) {
    errors.push('Cannot specify expected_error_code when expected_status is success');
  }
  if (validTemplate.expected_status === 'error' && validTemplate.expected_output) {
    errors.push('Cannot specify expected_output when expected_status is error');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Generate the actual fixture
  const fixture = await generateFixtureFromTemplate(validTemplate);

  // Validate the fixture against the schema
  const fixtureResult = dtuScenarioFixtureSchema.safeParse(fixture);
  if (!fixtureResult.success) {
    errors.push(`Generated fixture validation failed: ${fixtureResult.error.message}`);
    return { valid: false, errors };
  }

  return { valid: true, errors: [], fixture };
}

async function generateFixtureFromTemplate(template: ScenarioTemplate): Promise<DtuScenarioFixture> {
  const timestamp = Date.now();
  const seed = `seed-${template.scenario_id}`;

  const baseRequest = {
    twin_id: template.twin_id,
    operation: template.operation,
    scenario_id: template.scenario_id,
    seed,
    input: template.simulate ? { ...template.input, simulate: template.simulate } : template.input,
    timing: {
      requested_at_ms: timestamp,
      timeout_ms: 30000,
    },
    metadata: {
      created_by: 'dtu-curate',
      template_version: '1.0',
    },
  };

  // Run the request through the twin to get the expected response
  const runtime = createReferenceTwinRuntime();

  try {
    const response = await runtime.invoke(baseRequest);

    return {
      scenario_id: template.scenario_id,
      suite: template.suite,
      description: template.description,
      request: baseRequest,
      expected: response,
      expected_failure_mode: template.expected_failure_mode,
      tags: template.tags,
    };
  } catch (error) {
    // If invocation fails, create an error fixture
    return {
      scenario_id: template.scenario_id,
      suite: template.suite,
      description: template.description,
      request: baseRequest,
      expected: {
        twin_id: template.twin_id,
        twin_version: 'unknown',
        operation: template.operation,
        status: 'error',
        output: null,
        error: {
          code: 'internal_error',
          class: 'transient',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
          details: {},
        },
        timing: {
          started_at_ms: timestamp,
          completed_at_ms: timestamp,
          latency_ms: 0,
          deterministic: true,
        },
        metadata: {},
      },
      expected_failure_mode: template.expected_failure_mode,
      tags: template.tags,
    };
  }
}

export async function createScenario(
  options: ScenarioCurationOptions
): Promise<CurationReport> {
  if (!options.template) {
    throw new Error('Template is required for scenario creation');
  }

  const validation = await validateScenarioTemplate(options.template);
  if (!validation.valid || !validation.fixture) {
    throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
  }

  const fixturesRoot = resolve(options.fixturesRoot);
  const fixture = validation.fixture;

  // Determine file path
  const fileName = `${fixture.scenario_id}.${fixture.suite}.json`;
  const filePath = join(fixturesRoot, 'scenarios', fileName);

  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });

  // Write fixture
  await writeFile(filePath, `${JSON.stringify(fixture, null, 2)}\n`);

  // Return report
  const entries = await listScenarios(options);

  return {
    action: 'create',
    fixtures_root: fixturesRoot,
    entries,
    created_fixture: fixture,
  };
}

export async function runCuration(
  options: ScenarioCurationOptions
): Promise<CurationReport> {
  if (options.listOnly) {
    const entries = await listScenarios(options);
    return {
      action: 'list',
      fixtures_root: resolve(options.fixturesRoot),
      entries,
    };
  }

  if (options.validateOnly && options.template) {
    const validation = await validateScenarioTemplate(options.template);
    const entries = await listScenarios(options);
    return {
      action: 'validate',
      fixtures_root: resolve(options.fixturesRoot),
      entries,
      validation_results: [validation],
    };
  }

  if (options.template) {
    return createScenario(options);
  }

  // Default to list
  const entries = await listScenarios(options);
  return {
    action: 'list',
    fixtures_root: resolve(options.fixturesRoot),
    entries,
  };
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  
  async function walk(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
  
  await walk(dir);
  return results;
}

// Interactive prompt helpers (for CLI usage)
export function getAvailableTwins(): string[] {
  const runtime = createReferenceTwinRuntime();
  return runtime.listTwinIds();
}

export function getSupportedOperations(twinId: string): string[] {
  return TWIN_OPERATIONS[twinId] || [];
}

export function getFailureModeSimulations(failureMode: FailureMode): string[] {
  return FAILURE_MODE_SIMULATIONS[failureMode] || [];
}

export const AVAILABLE_SUITES: ScenarioSuite[] = ['smoke', 'regression', 'holdout'];
export const AVAILABLE_FAILURE_MODES: FailureMode[] = [
  'rate_limit',
  'auth_failure',
  'timeout',
  'malformed_payload',
  'partial_outage',
];
