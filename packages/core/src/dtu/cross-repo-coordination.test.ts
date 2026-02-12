import { describe, expect, it } from 'vitest';
import {
  type CrossRepoScenario,
  buildCrossRepoCoordinationReport,
  buildCrossRepoWorkflowReport,
  evaluateCrossRepoScenario,
} from './cross-repo-coordination.js';

describe('cross-repo-coordination', () => {
  describe('basic functionality', () => {
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

  describe('multi-repo scenarios (3+ repos)', () => {
    it('handles three repo transitive dependency chain', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'three-repo-chain',
        dependencies: [
          { repo: 'frontend', depends_on: ['backend'] },
          { repo: 'backend', depends_on: ['database'] },
          { repo: 'database', depends_on: [] },
        ],
        locks: [{ repo: 'database', lock_decision: 'reopen' }],
      };

      const result = evaluateCrossRepoScenario(scenario);
      expect(result.transitive_chain_valid).toBe(true);
      expect(result.propagated_locks).toHaveLength(3);
      
      const lockMap = new Map(result.propagated_locks.map(l => [l.repo, l.lock_decision]));
      expect(lockMap.get('frontend')).toBe('reopen');
      expect(lockMap.get('backend')).toBe('reopen');
      expect(lockMap.get('database')).toBe('reopen');
    });

    it('handles four repo diamond dependency pattern', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'diamond-pattern',
        dependencies: [
          { repo: 'api-gateway', depends_on: ['auth-service', 'data-service'] },
          { repo: 'auth-service', depends_on: ['database'] },
          { repo: 'data-service', depends_on: ['database'] },
          { repo: 'database', depends_on: [] },
        ],
        locks: [{ repo: 'database', lock_decision: 'reopen' }],
      };

      const result = evaluateCrossRepoScenario(scenario);
      expect(result.transitive_chain_valid).toBe(true);
      expect(result.propagated_locks).toHaveLength(4);
      
      const lockMap = new Map(result.propagated_locks.map(l => [l.repo, l.lock_decision]));
      expect(lockMap.get('api-gateway')).toBe('reopen');
      expect(lockMap.get('auth-service')).toBe('reopen');
      expect(lockMap.get('data-service')).toBe('reopen');
      expect(lockMap.get('database')).toBe('reopen');
    });

    it('handles five repo complex dependency graph', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'complex-five-repo',
        dependencies: [
          { repo: 'web-app', depends_on: ['api-service', 'cdn'] },
          { repo: 'api-service', depends_on: ['auth-service', 'cache'] },
          { repo: 'auth-service', depends_on: ['database'] },
          { repo: 'cache', depends_on: ['database'] },
          { repo: 'cdn', depends_on: [] },
          { repo: 'database', depends_on: [] },
        ],
        locks: [{ repo: 'database', lock_decision: 'reopen' }],
      };

      const result = evaluateCrossRepoScenario(scenario);
      expect(result.transitive_chain_valid).toBe(true);
      expect(result.propagated_locks).toHaveLength(6);
      
      const lockMap = new Map(result.propagated_locks.map(l => [l.repo, l.lock_decision]));
      expect(lockMap.get('web-app')).toBe('reopen');
      expect(lockMap.get('api-service')).toBe('reopen');
      expect(lockMap.get('auth-service')).toBe('reopen');
      expect(lockMap.get('cache')).toBe('reopen');
      expect(lockMap.get('database')).toBe('reopen');
      expect(lockMap.get('cdn')).toBe('resolved'); // cdn doesn't depend on database
    });
  });

  describe('repo A depends on repo B workflow completion', () => {
    it('repo A waits for repo B completion before starting', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'repo-a-waits-b',
        dependencies: [
          { repo: 'repo-a', depends_on: ['repo-b'] },
          { repo: 'repo-b', depends_on: [] },
        ],
        locks: [],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      const repoB = execMap.get('repo-b')!;
      const repoA = execMap.get('repo-a')!;
      
      expect(repoB.status).toBe('completed');
      expect(repoA.status).toBe('completed');
      
      // Verify execution order: repo-b should complete before repo-a
      expect(new Date(repoB.completed_at!).getTime()).toBeLessThanOrEqual(
        new Date(repoA.completed_at!).getTime()
      );
    });

    it('repo A fails when repo B fails', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'repo-a-fails-when-b-fails',
        dependencies: [
          { repo: 'repo-a', depends_on: ['repo-b'] },
          { repo: 'repo-b', depends_on: ['repo-c'] },
        ],
        locks: [{ repo: 'repo-c', lock_decision: 'reopen' }],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      expect(execMap.get('repo-c')?.status).toBe('failed');
      expect(execMap.get('repo-b')?.status).toBe('failed');
      expect(execMap.get('repo-a')?.status).toBe('failed');
      
      // All repos should have reopen locks due to propagation
      const lockMap = new Map(result.propagated_locks.map(l => [l.repo, l.lock_decision]));
      expect(lockMap.get('repo-a')).toBe('reopen');
      expect(lockMap.get('repo-b')).toBe('reopen');
      expect(lockMap.get('repo-c')).toBe('reopen');
    });
  });

  describe('lock state propagation across repos', () => {
    it('propagates resolved status through chain', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'propagate-resolved',
        dependencies: [
          { repo: 'repo-a', depends_on: ['repo-b'] },
          { repo: 'repo-b', depends_on: ['repo-c'] },
          { repo: 'repo-c', depends_on: ['repo-d'] },
        ],
        locks: [
          { repo: 'repo-a', lock_decision: 'resolved' },
          { repo: 'repo-b', lock_decision: 'resolved' },
          { repo: 'repo-c', lock_decision: 'resolved' },
          { repo: 'repo-d', lock_decision: 'resolved' },
        ],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      for (const lock of result.propagated_locks) {
        expect(lock.lock_decision).toBe('resolved');
      }
    });

    it('partial lock state propagates correctly', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'partial-locks',
        dependencies: [
          { repo: 'service-a', depends_on: ['shared-lib'] },
          { repo: 'service-b', depends_on: ['shared-lib'] },
          { repo: 'shared-lib', depends_on: [] },
        ],
        locks: [
          { repo: 'service-a', lock_decision: 'resolved' },
          { repo: 'shared-lib', lock_decision: 'reopen' },
        ],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const lockMap = new Map(result.propagated_locks.map(l => [l.repo, l.lock_decision]));
      expect(lockMap.get('shared-lib')).toBe('reopen');
      expect(lockMap.get('service-a')).toBe('reopen'); // Should propagate
      expect(lockMap.get('service-b')).toBe('reopen'); // Should also propagate
    });
  });

  describe('failure handling when dependent repo fails', () => {
    it('handles direct dependency failure', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'direct-dep-failure',
        dependencies: [
          { repo: 'consumer', depends_on: ['provider'] },
          { repo: 'provider', depends_on: [] },
        ],
        locks: [],
        execution_states: [
          { repo: 'provider', status: 'failed', error: 'Build failed' },
          { repo: 'consumer', status: 'pending' },
        ],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      // Provider stays failed, consumer fails due to dependency failure
      expect(execMap.get('provider')?.status).toBe('failed');
      expect(execMap.get('consumer')?.status).toBe('failed');
    });

    it('handles transitive dependency failure', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'transitive-dep-failure',
        dependencies: [
          { repo: 'app', depends_on: ['service'] },
          { repo: 'service', depends_on: ['database'] },
          { repo: 'database', depends_on: ['infrastructure'] },
          { repo: 'infrastructure', depends_on: [] },
        ],
        locks: [],
        execution_states: [
          { repo: 'infrastructure', status: 'failed', error: 'Deployment failed' },
        ],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      // Infrastructure fails, causing cascading failure through dependency chain
      expect(execMap.get('infrastructure')?.status).toBe('failed');
      expect(execMap.get('database')?.status).toBe('failed');
      expect(execMap.get('service')?.status).toBe('failed');
      expect(execMap.get('app')?.status).toBe('failed');
    });
  });

  describe('rollback coordination across repos', () => {
    it('coordinates rollback when failure detected', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'rollback-coordination',
        dependencies: [
          { repo: 'frontend', depends_on: ['backend'] },
          { repo: 'backend', depends_on: ['database'] },
          { repo: 'database', depends_on: [] },
        ],
        locks: [],
        execution_states: [
          { repo: 'database', status: 'completed' },
          { repo: 'backend', status: 'completed' },
          { repo: 'frontend', status: 'failed', error: 'Deployment error' },
        ],
        simulate_rollback: true,
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      expect(result.rollback_coordinated).toBe(true);
      
      const rollbackMap = new Map(result.rollback_results.map(r => [r.repo, r]));
      // All repos should be marked for rollback since they're part of the same transaction
      expect(rollbackMap.get('frontend')?.rollback_initiated).toBe(true);
      expect(rollbackMap.get('backend')?.rollback_initiated).toBe(true);
      expect(rollbackMap.get('database')?.rollback_initiated).toBe(true);
      
      // Completed repos should be rolled back, failed repos stay failed
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      expect(execMap.get('frontend')?.status).toBe('failed'); // Failed stays failed
      expect(execMap.get('backend')?.status).toBe('rolled_back'); // Completed gets rolled back
      expect(execMap.get('database')?.status).toBe('rolled_back'); // Completed gets rolled back
    });

    it('partial rollback when only some repos affected', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'partial-rollback',
        dependencies: [
          { repo: 'service-a', depends_on: ['shared-db'] },
          { repo: 'service-b', depends_on: ['shared-db'] },
          { repo: 'service-c', depends_on: [] },
          { repo: 'shared-db', depends_on: [] },
        ],
        locks: [],
        execution_states: [
          { repo: 'shared-db', status: 'completed' },
          { repo: 'service-a', status: 'completed' },
          { repo: 'service-b', status: 'failed', error: 'Timeout' },
          { repo: 'service-c', status: 'completed' },
        ],
        simulate_rollback: true,
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const rollbackMap = new Map(result.rollback_results.map(r => [r.repo, r]));
      // service-b failed, so it and everything it affects (via shared-db) should rollback
      expect(rollbackMap.get('service-b')?.rollback_initiated).toBe(true); // The failed repo
      expect(rollbackMap.get('shared-db')?.rollback_initiated).toBe(true); // Affected because service-b depends on it
      expect(rollbackMap.get('service-a')?.rollback_initiated).toBe(true); // Affected because it depends on shared-db
      expect(rollbackMap.get('service-c')?.rollback_initiated).toBe(true); // Affected because shared-db is rolled back
      
      // Verify execution states
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      expect(execMap.get('service-b')?.status).toBe('failed'); // Failed stays failed
      expect(execMap.get('shared-db')?.status).toBe('rolled_back'); // Completed gets rolled back
      expect(execMap.get('service-a')?.status).toBe('rolled_back'); // Completed gets rolled back
      expect(execMap.get('service-c')?.status).toBe('rolled_back'); // Completed gets rolled back
    });
  });

  describe('network failure handling', () => {
    it('handles network partition between repos', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'network-partition',
        dependencies: [
          { repo: 'repo-a', depends_on: ['repo-b'] },
          { repo: 'repo-b', depends_on: ['repo-c'] },
          { repo: 'repo-c', depends_on: [] },
        ],
        locks: [],
        simulate_network_failure: ['repo-b'],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const networkMap = new Map(result.network_results.map(n => [n.repo, n]));
      expect(networkMap.get('repo-a')?.reachable).toBe(true);
      expect(networkMap.get('repo-b')?.reachable).toBe(false);
      expect(networkMap.get('repo-c')?.reachable).toBe(true);
      
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      // repo-b fails due to network, repo-c completes (no dependency on repo-b), repo-a fails (depends on repo-b)
      expect(execMap.get('repo-b')?.status).toBe('failed');
      expect(execMap.get('repo-b')?.error).toContain('network');
      expect(execMap.get('repo-c')?.status).toBe('completed');
      expect(execMap.get('repo-a')?.status).toBe('failed');
    });

    it('handles multiple network failures', () => {
      const scenario: CrossRepoScenario = {
        scenario_id: 'multiple-network-failures',
        dependencies: [
          { repo: 'web', depends_on: ['api'] },
          { repo: 'api', depends_on: ['db', 'cache'] },
          { repo: 'db', depends_on: [] },
          { repo: 'cache', depends_on: [] },
        ],
        locks: [],
        simulate_network_failure: ['api', 'cache'],
      };

      const result = evaluateCrossRepoScenario(scenario);
      
      const execMap = new Map(result.execution_results.map(e => [e.repo, e]));
      // api and cache fail due to network issues
      expect(execMap.get('api')?.status).toBe('failed');
      expect(execMap.get('cache')?.status).toBe('failed');
      expect(execMap.get('web')?.status).toBe('failed'); // Depends on failed api
      expect(execMap.get('db')?.status).toBe('completed'); // Independent, no network issues
    });
  });

  describe('comprehensive coordination report', () => {
    it('builds full coordination report with all features', () => {
      const scenarios: CrossRepoScenario[] = [
        {
          scenario_id: 'cycle-detection',
          dependencies: [
            { repo: 'repo-a', depends_on: ['repo-b'] },
            { repo: 'repo-b', depends_on: ['repo-a'] },
          ],
          locks: [],
        },
        {
          scenario_id: 'lock-propagation',
          dependencies: [
            { repo: 'frontend', depends_on: ['backend'] },
            { repo: 'backend', depends_on: ['database'] },
            { repo: 'database', depends_on: [] },
          ],
          locks: [{ repo: 'database', lock_decision: 'reopen' }],
        },
        {
          scenario_id: 'transitive-chain',
          dependencies: [
            { repo: 'app', depends_on: ['service'] },
            { repo: 'service', depends_on: ['database'] },
            { repo: 'database', depends_on: ['infra'] },
            { repo: 'infra', depends_on: [] },
          ],
          locks: [{ repo: 'infra', lock_decision: 'resolved' }],
        },
        {
          scenario_id: 'network-failure',
          dependencies: [
            { repo: 'client', depends_on: ['server'] },
            { repo: 'server', depends_on: [] },
          ],
          locks: [],
          simulate_network_failure: ['server'],
        },
        {
          scenario_id: 'rollback-coordination',
          dependencies: [
            { repo: 'web', depends_on: ['api'] },
            { repo: 'api', depends_on: ['db'] },
            { repo: 'db', depends_on: [] },
          ],
          locks: [],
          execution_states: [
            { repo: 'db', status: 'completed' },
            { repo: 'api', status: 'completed' },
            { repo: 'web', status: 'failed', error: 'Deploy error' },
          ],
          simulate_rollback: true,
        },
      ];

      const report = buildCrossRepoCoordinationReport(scenarios);
      
      expect(report.schema_version).toBe('cross_repo_coordination_report.v1');
      expect(report.summary.total_scenarios).toBe(5);
      expect(report.validation.checks).toHaveLength(5);
      expect(report.validation.checks.map(c => c.name)).toContain('cycle_detection');
      expect(report.validation.checks.map(c => c.name)).toContain('lock_propagation');
      expect(report.validation.checks.map(c => c.name)).toContain('transitive_chain_validation');
      expect(report.validation.checks.map(c => c.name)).toContain('network_failure_handling');
      expect(report.validation.checks.map(c => c.name)).toContain('rollback_coordination');
      
      expect(report.summary.cycle_detection_passed).toBe(true);
      expect(report.summary.lock_propagation_passed).toBe(true);
      expect(report.summary.transitive_chain_passed).toBe(true);
      expect(report.summary.network_failure_handled).toBe(true);
      expect(report.summary.rollback_coordination_passed).toBe(true);
      
      expect(report.fa_007_status).toBe('pass');
    });
  });
});
