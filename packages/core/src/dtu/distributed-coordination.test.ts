import { describe, expect, it } from 'vitest';
import {
  type DistributedScenario,
  buildDistributedExecutionReport,
  evaluateScenario,
} from './distributed-coordination.js';

describe('distributed-coordination', () => {
  it('detects consensus when one partition reaches quorum', () => {
    const scenario: DistributedScenario = {
      scenario_id: 'consensus-1',
      instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      partitions: [
        { id: 'p1', instance_ids: ['a', 'b'], proposal: 'release-1' },
        { id: 'p2', instance_ids: ['c'], proposal: 'release-2' },
      ],
    };

    const result = evaluateScenario(scenario);
    expect(result.result).toBe('consensus');
    expect(result.leader_proposal).toBe('release-1');
  });

  it('detects split-brain when multiple partitions meet quorum', () => {
    const scenario: DistributedScenario = {
      scenario_id: 'split-1',
      instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      partitions: [
        { id: 'p1', instance_ids: ['a', 'b'], proposal: 'proposal-a' },
        { id: 'p2', instance_ids: ['c', 'd'], proposal: 'proposal-b' },
      ],
      quorum_size: 2,
    };

    const result = evaluateScenario(scenario);
    expect(result.result).toBe('split_brain');
    expect(result.notes.some(note => note.includes('Split-brain'))).toBe(true);
  });

  it('detects no-quorum when no partition reaches quorum', () => {
    const scenario: DistributedScenario = {
      scenario_id: 'no-quorum-1',
      instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      partitions: [
        { id: 'p1', instance_ids: ['a'], proposal: 'proposal-a' },
        { id: 'p2', instance_ids: ['b'], proposal: 'proposal-b' },
      ],
    };

    const result = evaluateScenario(scenario);
    expect(result.result).toBe('no_quorum');
    expect(result.leader_proposal).toBeNull();
  });

  it('builds report with validation checks', () => {
    const scenarios: DistributedScenario[] = [
      {
        scenario_id: 'consensus',
        instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        partitions: [{ id: 'p1', instance_ids: ['a', 'b'], proposal: 'p1' }],
      },
      {
        scenario_id: 'split',
        instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        partitions: [
          { id: 'p1', instance_ids: ['a', 'b'], proposal: 'p1' },
          { id: 'p2', instance_ids: ['c', 'd'], proposal: 'p2' },
        ],
        quorum_size: 2,
      },
      {
        scenario_id: 'no-quorum',
        instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        partitions: [{ id: 'p1', instance_ids: ['a'], proposal: 'p1' }],
      },
    ];

    const report = buildDistributedExecutionReport(scenarios);
    expect(report.summary.total_scenarios).toBe(3);
    expect(report.summary.consensus).toBe(1);
    expect(report.summary.split_brain).toBe(1);
    expect(report.summary.no_quorum).toBe(1);
    expect(report.validation.passed).toBe(true);
  });
});
