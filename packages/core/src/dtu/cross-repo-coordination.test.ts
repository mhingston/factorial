import { describe, expect, it } from 'vitest';
import {
  type CrossRepoScenario,
  buildCrossRepoWorkflowReport,
  evaluateCrossRepoScenario,
} from './cross-repo-coordination.js';

describe('cross-repo-coordination', () => {
  it('propagates reopen locks through dependencies', () => {
    const scenario: CrossRepoScenario = {
      scenario_id: 'propagate-1',
      dependencies: [
        { repo: 'repo-a', depends_on: ['repo-b'] },
        { repo: 'repo-b', depends_on: ['repo-c'] },
      ],
      locks: [{ repo: 'repo-c', lock_decision: 'reopen' }],
    };

    const result = evaluateCrossRepoScenario(scenario);
    const lockMap = new Map(result.propagated_locks.map(lock => [lock.repo, lock.lock_decision]));
    expect(lockMap.get('repo-a')).toBe('reopen');
    expect(lockMap.get('repo-b')).toBe('reopen');
    expect(lockMap.get('repo-c')).toBe('reopen');
  });

  it('detects dependency cycles', () => {
    const scenario: CrossRepoScenario = {
      scenario_id: 'cycle-1',
      dependencies: [
        { repo: 'repo-a', depends_on: ['repo-b'] },
        { repo: 'repo-b', depends_on: ['repo-a'] },
      ],
      locks: [],
    };

    const result = evaluateCrossRepoScenario(scenario);
    expect(result.status).toBe('fail');
    expect(result.notes.some(note => note.includes('Dependency cycles'))).toBe(true);
  });

  it('builds report with validation checks', () => {
    const scenarios: CrossRepoScenario[] = [
      {
        scenario_id: 'cycle',
        dependencies: [
          { repo: 'repo-a', depends_on: ['repo-b'] },
          { repo: 'repo-b', depends_on: ['repo-a'] },
        ],
        locks: [],
      },
      {
        scenario_id: 'propagate',
        dependencies: [
          { repo: 'repo-a', depends_on: ['repo-b'] },
          { repo: 'repo-b', depends_on: ['repo-c'] },
        ],
        locks: [{ repo: 'repo-c', lock_decision: 'reopen' }],
      },
    ];

    const report = buildCrossRepoWorkflowReport(scenarios);
    expect(report.summary.total_scenarios).toBe(2);
    expect(report.validation.checks).toHaveLength(2);
    expect(report.validation.passed).toBe(true);
    expect(report.fa_007_status).toBe('pass');
  });
});
