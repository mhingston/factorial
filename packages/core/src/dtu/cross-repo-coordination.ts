import { z } from 'zod';

export interface CrossRepoDependency {
  repo: string;
  depends_on: string[];
}

export interface CrossRepoLockState {
  repo: string;
  lock_decision: 'resolved' | 'reopen';
}

export interface CrossRepoScenario {
  scenario_id: string;
  dependencies: CrossRepoDependency[];
  locks: CrossRepoLockState[];
}

export interface CrossRepoScenarioResult {
  scenario_id: string;
  status: 'pass' | 'fail';
  propagated_locks: CrossRepoLockState[];
  notes: string[];
}

export const crossRepoWorkflowReportSchema = z.object({
  schema_version: z.literal('cross_repo_workflow_report.v1'),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_scenarios: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  scenarios: z.array(
    z.object({
      scenario_id: z.string().min(1),
      status: z.enum(['pass', 'fail']),
      propagated_locks: z.array(
        z.object({
          repo: z.string().min(1),
          lock_decision: z.enum(['resolved', 'reopen']),
        })
      ),
      notes: z.array(z.string()),
    })
  ),
  validation: z.object({
    passed: z.boolean(),
    checks: z.array(
      z.object({
        name: z.string().min(1),
        passed: z.boolean(),
        message: z.string().min(1),
      })
    ),
  }),
  fa_007_status: z.enum(['pass', 'fail']),
});

export type CrossRepoWorkflowReport = z.infer<typeof crossRepoWorkflowReportSchema>;

function resolveLockDecision(locks: Map<string, 'resolved' | 'reopen'>, repo: string): 'resolved' | 'reopen' {
  return locks.get(repo) ?? 'resolved';
}

function buildDependencyMap(dependencies: CrossRepoDependency[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const dep of dependencies) {
    map.set(dep.repo, [...new Set(dep.depends_on)].sort());
  }
  return map;
}

function detectCycles(dependencyMap: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[] = [];

  const dfs = (repo: string, path: string[]) => {
    if (stack.has(repo)) {
      cycles.push([...path, repo].join(' -> '));
      return;
    }
    if (visited.has(repo)) return;
    visited.add(repo);
    stack.add(repo);
    const deps = dependencyMap.get(repo) ?? [];
    for (const dep of deps) {
      dfs(dep, [...path, repo]);
    }
    stack.delete(repo);
  };

  for (const repo of dependencyMap.keys()) {
    dfs(repo, []);
  }

  return cycles;
}

function propagateLocks(
  dependencies: CrossRepoDependency[],
  locks: CrossRepoLockState[]
): CrossRepoLockState[] {
  const dependencyMap = buildDependencyMap(dependencies);
  const lockMap = new Map<string, 'resolved' | 'reopen'>(
    locks.map(lock => [lock.repo, lock.lock_decision])
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const [repo, deps] of dependencyMap.entries()) {
      const current = resolveLockDecision(lockMap, repo);
      if (current === 'reopen') continue;
      const hasReopenDep = deps.some(dep => resolveLockDecision(lockMap, dep) === 'reopen');
      if (hasReopenDep) {
        lockMap.set(repo, 'reopen');
        changed = true;
      }
    }
  }

  const repos = [...new Set([...dependencyMap.keys(), ...lockMap.keys()])].sort();
  return repos.map(repo => ({ repo, lock_decision: resolveLockDecision(lockMap, repo) }));
}

export function evaluateCrossRepoScenario(scenario: CrossRepoScenario): CrossRepoScenarioResult {
  const notes: string[] = [];
  const dependencyMap = buildDependencyMap(scenario.dependencies);
  const cycles = detectCycles(dependencyMap);
  if (cycles.length > 0) {
    notes.push(`Dependency cycles detected: ${cycles.join('; ')}`);
  }

  const propagated = propagateLocks(scenario.dependencies, scenario.locks);
  const hasCycle = cycles.length > 0;
  const hasReopen = propagated.some(lock => lock.lock_decision === 'reopen');
  const status: CrossRepoScenarioResult['status'] = hasCycle ? 'fail' : 'pass';

  if (hasReopen) {
    notes.push('Lock propagation resulted in reopen decisions.');
  }

  return {
    scenario_id: scenario.scenario_id,
    status,
    propagated_locks: propagated,
    notes,
  };
}

export function buildCrossRepoWorkflowReport(
  scenarios: CrossRepoScenario[]
): CrossRepoWorkflowReport {
  const results = scenarios.map(evaluateCrossRepoScenario);
  const summary = {
    total_scenarios: results.length,
    passed: results.filter(result => result.status === 'pass').length,
    failed: results.filter(result => result.status === 'fail').length,
  };

  const checks = [
    {
      name: 'cycle_detection',
      passed: results.some(result => result.notes.some(note => note.includes('Dependency cycles'))),
      message: 'Cycle detection exercised.',
    },
    {
      name: 'lock_propagation',
      passed: results.some(result => result.propagated_locks.some(lock => lock.lock_decision === 'reopen')),
      message: 'Lock propagation exercised.',
    },
  ];

  const validationPassed = checks.every(check => check.passed);

  return {
    schema_version: 'cross_repo_workflow_report.v1',
    generated_at: new Date().toISOString(),
    summary,
    scenarios: results,
    validation: {
      passed: validationPassed,
      checks,
    },
    fa_007_status: validationPassed ? 'pass' : 'fail',
  };
}
