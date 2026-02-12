import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AVAILABLE_SUITES,
  type ScenarioTemplate,
  createScenario,
  getAvailableTwins,
  getSupportedOperations,
  listScenarios,
  runCuration,
  validateScenarioTemplate,
} from './scenario-curation.js';

describe('scenario-curation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dtu-curate-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('listScenarios', () => {
    it('returns empty array for empty directory', async () => {
      const entries = await listScenarios({ fixturesRoot: tempDir });
      expect(entries).toEqual([]);
    });

    it('lists scenarios from fixtures directory', async () => {
      const scenariosDir = join(tempDir, 'scenarios');
      await mkdir(scenariosDir, { recursive: true });

      await writeFile(
        join(scenariosDir, '01-test.smoke.json'),
        JSON.stringify({
          scenario_id: '01-test',
          suite: 'smoke',
          description: 'Test scenario',
          request: {
            twin_id: 'jira.issue',
            operation: 'issues.create',
            scenario_id: '01-test',
            seed: 'seed-1',
            input: {},
            timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
            metadata: {},
          },
          expected: {
            twin_id: 'jira.issue',
            twin_version: '0.1.0',
            operation: 'issues.create',
            status: 'success',
            output: {},
            error: null,
            timing: {
              started_at_ms: 1700000000000,
              completed_at_ms: 1700000000010,
              latency_ms: 10,
              deterministic: true,
            },
            metadata: {},
          },
          tags: [],
        })
      );

      const entries = await listScenarios({ fixturesRoot: tempDir });
      expect(entries).toHaveLength(1);
      expect(entries[0].scenario_id).toBe('01-test');
      expect(entries[0].suite).toBe('smoke');
      expect(entries[0].twin_id).toBe('jira.issue');
    });

    it('filters by twin_id', async () => {
      const scenariosDir = join(tempDir, 'scenarios');
      await mkdir(scenariosDir, { recursive: true });

      await writeFile(
        join(scenariosDir, '01-jira.smoke.json'),
        JSON.stringify({
          scenario_id: '01-jira',
          suite: 'smoke',
          description: 'Jira test',
          request: {
            twin_id: 'jira.issue',
            operation: 'issues.create',
            scenario_id: '01-jira',
            seed: 'seed-1',
            input: {},
            timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
            metadata: {},
          },
          expected: {
            twin_id: 'jira.issue',
            twin_version: '0.1.0',
            operation: 'issues.create',
            status: 'success',
            output: {},
            error: null,
            timing: {
              started_at_ms: 1700000000000,
              completed_at_ms: 1700000000010,
              latency_ms: 10,
              deterministic: true,
            },
            metadata: {},
          },
          tags: [],
        })
      );

      await writeFile(
        join(scenariosDir, '02-slack.smoke.json'),
        JSON.stringify({
          scenario_id: '02-slack',
          suite: 'smoke',
          description: 'Slack test',
          request: {
            twin_id: 'slack.channel',
            operation: 'messages.post',
            scenario_id: '02-slack',
            seed: 'seed-2',
            input: {},
            timing: { requested_at_ms: 1700000000000, timeout_ms: 1000 },
            metadata: {},
          },
          expected: {
            twin_id: 'slack.channel',
            twin_version: '0.1.0',
            operation: 'messages.post',
            status: 'success',
            output: {},
            error: null,
            timing: {
              started_at_ms: 1700000000000,
              completed_at_ms: 1700000000010,
              latency_ms: 10,
              deterministic: true,
            },
            metadata: {},
          },
          tags: [],
        })
      );

      const jiraEntries = await listScenarios({ fixturesRoot: tempDir, twinFilter: 'jira' });
      expect(jiraEntries).toHaveLength(1);
      expect(jiraEntries[0].twin_id).toBe('jira.issue');
    });
  });

  describe('validateScenarioTemplate', () => {
    it('validates a correct template', async () => {
      const template: ScenarioTemplate = {
        scenario_id: 'test-scenario',
        suite: 'smoke',
        description: 'A test scenario',
        twin_id: 'jira.issue',
        operation: 'issues.create',
        input: {
          project_key: 'TEST',
          summary: 'Test issue',
          actor: 'tester',
        },
        expected_status: 'success',
        tags: ['test'],
      };

      const result = await validateScenarioTemplate(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.fixture).toBeDefined();
    });

    it('rejects invalid twin_id', async () => {
      const template: ScenarioTemplate = {
        scenario_id: 'test-scenario',
        suite: 'smoke',
        description: 'A test scenario',
        twin_id: 'unknown.twin',
        operation: 'issues.create',
        input: {},
        expected_status: 'success',
        tags: [],
      };

      const result = await validateScenarioTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unknown twin_id'))).toBe(true);
    });

    it('rejects unsupported operation', async () => {
      const template: ScenarioTemplate = {
        scenario_id: 'test-scenario',
        suite: 'smoke',
        description: 'A test scenario',
        twin_id: 'jira.issue',
        operation: 'unsupported.operation',
        input: {},
        expected_status: 'success',
        tags: [],
      };

      const result = await validateScenarioTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unsupported operation'))).toBe(true);
    });

    it('rejects error code with success status', async () => {
      const template: ScenarioTemplate = {
        scenario_id: 'test-scenario',
        suite: 'smoke',
        description: 'A test scenario',
        twin_id: 'jira.issue',
        operation: 'issues.create',
        input: {},
        expected_status: 'success',
        expected_error_code: 'auth_failed',
        tags: [],
      };

      const result = await validateScenarioTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('expected_error_code'))).toBe(true);
    });
  });

  describe('createScenario', () => {
    it('creates a scenario fixture file', async () => {
      const template: ScenarioTemplate = {
        scenario_id: 'new-scenario',
        suite: 'smoke',
        description: 'A new scenario',
        twin_id: 'jira.issue',
        operation: 'issues.create',
        input: {
          project_key: 'TEST',
          summary: 'New test issue',
          actor: 'tester',
        },
        expected_status: 'success',
        tags: ['new'],
      };

      const report = await createScenario({
        fixturesRoot: tempDir,
        template,
      });

      expect(report.action).toBe('create');
      expect(report.created_fixture).toBeDefined();
      expect(report.created_fixture!.scenario_id).toBe('new-scenario');
      expect(report.entries).toHaveLength(1);
    });

    it('throws on invalid template', async () => {
      const template: ScenarioTemplate = {
        scenario_id: 'test',
        suite: 'smoke',
        description: 'Test',
        twin_id: 'unknown.twin',
        operation: 'test',
        input: {},
        expected_status: 'success',
        tags: [],
      };

      await expect(
        createScenario({ fixturesRoot: tempDir, template })
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('runCuration', () => {
    it('lists scenarios with listOnly', async () => {
      const report = await runCuration({
        fixturesRoot: tempDir,
        listOnly: true,
      });

      expect(report.action).toBe('list');
      expect(report.entries).toEqual([]);
    });

    it('validates template with validateOnly', async () => {
      const template: ScenarioTemplate = {
        scenario_id: 'test',
        suite: 'smoke',
        description: 'Test',
        twin_id: 'jira.issue',
        operation: 'issues.create',
        input: {},
        expected_status: 'success',
        tags: [],
      };

      const report = await runCuration({
        fixturesRoot: tempDir,
        validateOnly: true,
        template,
      });

      expect(report.action).toBe('validate');
      expect(report.validation_results).toHaveLength(1);
      expect(report.validation_results![0].valid).toBe(true);
    });
  });

  describe('helper functions', () => {
    it('getAvailableTwins returns registered twins', () => {
      const twins = getAvailableTwins();
      expect(twins).toContain('jira.issue');
      expect(twins).toContain('slack.channel');
      expect(twins).toContain('github.issue');
      expect(twins).toContain('aws.s3');
      expect(twins).toContain('database.records');
    });

    it('getSupportedOperations returns operations for twin', () => {
      const jiraOps = getSupportedOperations('jira.issue');
      expect(jiraOps).toContain('issues.create');

      const slackOps = getSupportedOperations('slack.channel');
      expect(slackOps).toContain('messages.post');
    });

    it('AVAILABLE_SUITES contains all suites', () => {
      expect(AVAILABLE_SUITES).toContain('smoke');
      expect(AVAILABLE_SUITES).toContain('regression');
      expect(AVAILABLE_SUITES).toContain('holdout');
    });
  });
});
