import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  type TwinParityFixture,
  parseTwinInvocationResponse,
  parseTwinParityFixture,
} from './contracts.js';
import { InMemoryTwinRuntime } from './runtime.js';
import { createReferenceTwinRuntime } from './reference-runtime.js';

const FIXTURE_ROOTS = [
  new URL('../../../../tests/fixtures/dtu/jira-issue/', import.meta.url),
  new URL('../../../../tests/fixtures/dtu/slack-channel/', import.meta.url),
];

describe('DTU parity fixtures', () => {
  it('validates all recorded fixtures against the twin contract schema (AT-01)', async () => {
    const fixtures = await loadFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('replays recorded fixtures through reference twins with exact parity (AT-02)', async () => {
    const fixtures = await loadFixtures();
    const runtime = createReferenceTwinRuntime({
      now_ms: () => 1700000000000,
    });

    for (const fixture of fixtures) {
      const response = await runtime.invoke(fixture.request);
      expect(parseTwinInvocationResponse(response)).toEqual(fixture.expected);
    }
  });

  it('returns contract-valid not_found errors for unknown twins', async () => {
    const runtime = new InMemoryTwinRuntime();
    const response = await runtime.invoke({
      twin_id: 'unknown.twin',
      operation: 'noop',
      scenario_id: 'unknown-twin',
      seed: 'seed-unknown',
      input: {},
      timing: {
        requested_at_ms: 1700000000000,
        timeout_ms: 1000,
      },
      metadata: {
        suite: 'phase-a',
      },
    });

    expect(parseTwinInvocationResponse(response)).toMatchObject({
      status: 'error',
      error: {
        code: 'twin_not_found',
        class: 'not_found',
        retryable: false,
      },
      timing: {
        deterministic: true,
        latency_ms: 0,
      },
    });
  });
});

async function loadFixtures(): Promise<TwinParityFixture[]> {
  const fixtures: TwinParityFixture[] = [];

  for (const root of FIXTURE_ROOTS) {
    const entries = (await readdir(root)).filter(entry => entry.endsWith('.json')).sort();
    for (const entry of entries) {
      const raw = await readFile(new URL(entry, root), 'utf-8');
      fixtures.push(parseTwinParityFixture(JSON.parse(raw)));
    }
  }

  return fixtures;
}
