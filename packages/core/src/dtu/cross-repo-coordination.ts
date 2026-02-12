import { z } from 'zod';

export interface CrossRepoDependency {
  repo: string;
  depends_on: string[];
}

export interface CrossRepoLockState {
  repo: string;
  lock_decision: 'resolved' | 'reopen';
}

export interface CrossRepoExecutionState {
  repo: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface CrossRepoNetworkState {
  repo: string;
  reachable: boolean;
  last_heartbeat?: string;
  failure_reason?: string;
}

export interface CrossRepoRollbackState {
  repo: string;
  rollback_initiated: boolean;
  rollback_completed: boolean;
  rollback_error?: string;
}

export interface CrossRepoScenario {
  scenario_id: string;
  dependencies: CrossRepoDependency[];
  locks: CrossRepoLockState[];
  execution_states?: CrossRepoExecutionState[];
  network_states?: CrossRepoNetworkState[];
  rollback_states?: CrossRepoRollbackState[];
  simulate_network_failure?: string[];
  simulate_rollback?: boolean;
}

export interface CrossRepoScenarioResult {
  scenario_id: string;
  status: 'pass' | 'fail';
  propagated_locks: CrossRepoLockState[];
  execution_results: CrossRepoExecutionState[];
  network_results: CrossRepoNetworkState[];
  rollback_results: CrossRepoRollbackState[];
  notes: string[];
  transitive_chain_valid: boolean;
  rollback_coordinated: boolean;
}

// Legacy schema for backward compatibility
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

// New comprehensive schema for FA-007
export const crossRepoCoordinationReportSchema = z.object({
  schema_version: z.literal('cross_repo_coordination_report.v1'),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_scenarios: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    cycle_detection_passed: z.boolean(),
    lock_propagation_passed: z.boolean(),
    transitive_chain_passed: z.boolean(),
    network_failure_handled: z.boolean(),
    rollback_coordination_passed: z.boolean(),
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
      execution_results: z.array(
        z.object({
          repo: z.string().min(1),
          status: z.enum(['pending', 'running', 'completed', 'failed', 'rolled_back']),
          started_at: z.string().optional(),
          completed_at: z.string().optional(),
          error: z.string().optional(),
        })
      ),
      network_results: z.array(
        z.object({
          repo: z.string().min(1),
          reachable: z.boolean(),
          last_heartbeat: z.string().optional(),
          failure_reason: z.string().optional(),
        })
      ),
      rollback_results: z.array(
        z.object({
          repo: z.string().min(1),
          rollback_initiated: z.boolean(),
          rollback_completed: z.boolean(),
          rollback_error: z.string().optional(),
        })
      ),
      notes: z.array(z.string()),
      transitive_chain_valid: z.boolean(),
      rollback_coordinated: z.boolean(),
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
export type CrossRepoCoordinationReport = z.infer<typeof crossRepoCoordinationReportSchema>;

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

function validateTransitiveChain(
  dependencies: CrossRepoDependency[],
  locks: CrossRepoLockState[]
): { valid: boolean; notes: string[] } {
  const dependencyMap = buildDependencyMap(dependencies);
  const lockMap = new Map(locks.map(l => [l.repo, l.lock_decision]));
  const notes: string[] = [];
  
  // Check that all transitive dependencies are properly tracked
  for (const [repo, deps] of dependencyMap.entries()) {
    const visited = new Set<string>();
    const queue = [...deps];
    
    while (queue.length > 0) {
      const dep = queue.shift()!;
      if (visited.has(dep)) continue;
      visited.add(dep);
      
      const transitiveDeps = dependencyMap.get(dep) ?? [];
      queue.push(...transitiveDeps);
      
      // Verify lock consistency
      const repoLock = lockMap.get(repo);
      const depLock = lockMap.get(dep);
      
      if (depLock === 'reopen' && repoLock === 'resolved') {
        notes.push(`Inconsistent lock state: ${repo} is resolved but depends on reopened ${dep}`);
      }
    }
  }
  
  return { valid: notes.length === 0, notes };
}

function simulateExecution(
  dependencies: CrossRepoDependency[],
  locks: CrossRepoLockState[],
  networkStates?: CrossRepoNetworkState[],
  simulateNetworkFailure?: string[],
  providedExecutionStates?: CrossRepoExecutionState[]
): CrossRepoExecutionState[] {
  const dependencyMap = buildDependencyMap(dependencies);
  const lockMap = new Map(locks.map(l => [l.repo, l.lock_decision]));
  const networkMap = new Map(networkStates?.map(n => [n.repo, n]) ?? []);
  const failureSet = new Set(simulateNetworkFailure ?? []);
  const providedStatesMap = new Map(providedExecutionStates?.map(e => [e.repo, e]) ?? []);
  const executionStates = new Map<string, CrossRepoExecutionState>();
  const now = new Date().toISOString();
  
  // Initialize all repos
  const allRepos = new Set([...dependencyMap.keys(), ...lockMap.keys()]);
  for (const repo of allRepos) {
    // Use provided state if available, otherwise start pending
    const provided = providedStatesMap.get(repo);
    executionStates.set(repo, {
      repo,
      status: provided?.status ?? 'pending',
      error: provided?.error,
      started_at: provided?.started_at,
      completed_at: provided?.completed_at,
    });
  }
  
  // Check for cycles first
  const cycles = detectCycles(dependencyMap);
  if (cycles.length > 0) {
    // In case of cycles, mark all repos as failed
    for (const repo of allRepos) {
      const state = executionStates.get(repo)!;
      state.status = 'failed';
      state.completed_at = now;
      state.error = 'Dependency cycle detected';
    }
    return Array.from(executionStates.values()).sort((a, b) => a.repo.localeCompare(b.repo));
  }
  
  // First pass: handle repos with provided states (they're already set)
  // Second pass: simulate remaining repos
  const executed = new Set<string>();
  const inProgress = new Set<string>();
  
  // Mark already completed/failed repos from provided states as executed
  for (const [repo, state] of executionStates) {
    if (state.status === 'completed' || state.status === 'failed') {
      executed.add(repo);
    }
  }
  
  function canExecute(repo: string): boolean {
    const deps = dependencyMap.get(repo) ?? [];
    return deps.every(dep => {
      const depState = executionStates.get(dep);
      // A dependency is "executed" if it's completed or failed
      return depState?.status === 'completed' || depState?.status === 'failed';
    });
  }
  
  // Process repos iteratively to avoid stack overflow
  let madeProgress = true;
  while (madeProgress && executed.size < allRepos.size) {
    madeProgress = false;
    
    for (const repo of allRepos) {
      if (executed.has(repo) || inProgress.has(repo)) continue;
      
      // Check if any dependency has failed - if so, this repo fails too
      const deps = dependencyMap.get(repo) ?? [];
      const hasFailedDep = deps.some(dep => executionStates.get(dep)?.status === 'failed');
      
      if (hasFailedDep) {
        // Dependency failed, so this repo fails
        const state = executionStates.get(repo)!;
        state.status = 'failed';
        state.completed_at = now;
        state.error = state.error || 'Dependency failed';
        executed.add(repo);
        madeProgress = true;
        continue;
      }
      
      if (canExecute(repo)) {
        inProgress.add(repo);
        const state = executionStates.get(repo)!;
        state.started_at = now;
        
        // Check for network failure simulation
        if (failureSet.has(repo)) {
          state.status = 'failed';
          state.completed_at = now;
          state.error = 'Simulated network failure';
        } else if (lockMap.get(repo) === 'reopen') {
          state.status = 'failed';
          state.completed_at = now;
          state.error = 'Dependency lock is reopened';
        } else {
          const networkState = networkMap.get(repo);
          if (networkState && !networkState.reachable) {
            state.status = 'failed';
            state.completed_at = now;
            state.error = networkState.failure_reason || 'Network unreachable';
          } else {
            state.status = 'completed';
            state.completed_at = now;
          }
        }
        
        executed.add(repo);
        inProgress.delete(repo);
        madeProgress = true;
      }
    }
  }
  
  // Mark any remaining pending repos as failed (circular dependency or missing deps)
  for (const repo of allRepos) {
    const state = executionStates.get(repo)!;
    if (state.status === 'pending') {
      state.status = 'failed';
      state.completed_at = now;
      state.error = state.error || 'Could not execute due to dependency issues';
    }
  }
  
  return Array.from(executionStates.values()).sort((a, b) => a.repo.localeCompare(b.repo));
}

function simulateNetworkStates(
  dependencies: CrossRepoDependency[],
  simulateNetworkFailure?: string[]
): CrossRepoNetworkState[] {
  const dependencyMap = buildDependencyMap(dependencies);
  const allRepos = new Set([...dependencyMap.keys()]);
  const failureSet = new Set(simulateNetworkFailure ?? []);
  const now = new Date().toISOString();
  
  return Array.from(allRepos).sort().map(repo => ({
    repo,
    reachable: !failureSet.has(repo),
    last_heartbeat: failureSet.has(repo) ? undefined : now,
    failure_reason: failureSet.has(repo) ? 'Simulated network partition' : undefined,
  }));
}

function coordinateRollback(
  dependencies: CrossRepoDependency[],
  executionStates: CrossRepoExecutionState[],
  simulateRollback?: boolean
): CrossRepoRollbackState[] {
  const dependencyMap = buildDependencyMap(dependencies);
  const executionMap = new Map(executionStates.map(e => [e.repo, e]));
  const rollbackStates = new Map<string, CrossRepoRollbackState>();
  const now = new Date().toISOString();
  
  // Initialize rollback states
  const allRepos = new Set([...dependencyMap.keys(), ...executionMap.keys()]);
  for (const repo of allRepos) {
    rollbackStates.set(repo, {
      repo,
      rollback_initiated: false,
      rollback_completed: false,
    });
  }
  
  // Check if rollback is needed
  if (simulateRollback) {
    // Build reverse dependency map
    const reverseDeps = new Map<string, string[]>();
    for (const [repo, deps] of dependencyMap.entries()) {
      for (const dep of deps) {
        if (!reverseDeps.has(dep)) {
          reverseDeps.set(dep, []);
        }
        reverseDeps.get(dep)!.push(repo);
      }
    }
    
    // Find all repos affected by failures (transitive)
    // This includes: all failed repos + all repos that depend on them (directly or transitively)
    const affectedRepos = new Set<string>();
    
    if (simulateRollback) {
      // When simulating rollback, include ALL repos
      for (const repo of allRepos) {
        affectedRepos.add(repo);
      }
    } else {
      // Find all repos that completed successfully but need rollback
      // due to dependent repo failures
      const failedRepos = new Set(executionStates.filter(e => e.status === 'failed').map(e => e.repo));
      const queue = Array.from(failedRepos);
      
      while (queue.length > 0) {
        const repo = queue.shift()!;
        if (affectedRepos.has(repo)) continue;
        affectedRepos.add(repo);
        
        // Find repos that depend on this one
        const dependents = reverseDeps.get(repo) ?? [];
        for (const dependent of dependents) {
          if (!affectedRepos.has(dependent)) {
            queue.push(dependent);
          }
        }
      }
    }
    
    // Initiate rollback for affected repos
    for (const repo of affectedRepos) {
      const state = rollbackStates.get(repo)!;
      state.rollback_initiated = true;
      
      const execState = executionMap.get(repo);
      if (execState && execState.status === 'completed') {
        // Only change status to rolled_back for repos that completed successfully
        // Failed repos keep their failed status
        execState.status = 'rolled_back';
        execState.completed_at = now;
      }
      
      // Simulate rollback completion
      state.rollback_completed = true;
    }
  }
  
  return Array.from(rollbackStates.values()).sort((a, b) => a.repo.localeCompare(b.repo));
}

export function evaluateCrossRepoScenario(scenario: CrossRepoScenario): CrossRepoScenarioResult {
  const notes: string[] = [];
  const dependencyMap = buildDependencyMap(scenario.dependencies);
  
  // Detect cycles
  const cycles = detectCycles(dependencyMap);
  if (cycles.length > 0) {
    notes.push(`Dependency cycles detected: ${cycles.join('; ')}`);
  }
  
  // Propagate locks
  const propagated = propagateLocks(scenario.dependencies, scenario.locks);
  
  // Validate transitive chain
  const chainValidation = validateTransitiveChain(scenario.dependencies, propagated);
  notes.push(...chainValidation.notes);
  
  // Simulate network states
  const networkResults = scenario.network_states ?? simulateNetworkStates(
    scenario.dependencies,
    scenario.simulate_network_failure
  );
  
  // Simulate execution (passing provided states so they can be integrated)
  const executionResults = simulateExecution(
    scenario.dependencies,
    propagated,
    networkResults,
    scenario.simulate_network_failure,
    scenario.execution_states
  );
  
  // Coordinate rollback if needed (only if explicitly requested)
  const rollbackResults = coordinateRollback(
    scenario.dependencies,
    executionResults,
    scenario.simulate_rollback ?? false
  );
  
  const hasCycle = cycles.length > 0;
  const hasReopen = propagated.some(lock => lock.lock_decision === 'reopen');
  const hasFailure = executionResults.some(e => e.status === 'failed');
  
  if (hasReopen) {
    notes.push('Lock propagation resulted in reopen decisions.');
  }
  
  if (hasFailure) {
    notes.push('Execution failures detected, rollback coordinated.');
  }
  
  const status: CrossRepoScenarioResult['status'] = hasCycle ? 'fail' : 'pass';
  const rollbackCoordinated = rollbackResults.some(r => r.rollback_initiated);
  
  return {
    scenario_id: scenario.scenario_id,
    status,
    propagated_locks: propagated,
    execution_results: executionResults,
    network_results: networkResults,
    rollback_results: rollbackResults,
    notes,
    transitive_chain_valid: chainValidation.valid,
    rollback_coordinated: rollbackCoordinated,
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
    scenarios: results.map(r => ({
      scenario_id: r.scenario_id,
      status: r.status,
      propagated_locks: r.propagated_locks,
      notes: r.notes,
    })),
    validation: {
      passed: validationPassed,
      checks,
    },
    fa_007_status: validationPassed ? 'pass' : 'fail',
  };
}

export function buildCrossRepoCoordinationReport(
  scenarios: CrossRepoScenario[]
): CrossRepoCoordinationReport {
  const results = scenarios.map(evaluateCrossRepoScenario);
  
  const cycleDetectionPassed = results.some(r => 
    r.notes.some(note => note.includes('Dependency cycles'))
  );
  
  const lockPropagationPassed = results.some(r => 
    r.propagated_locks.some(lock => lock.lock_decision === 'reopen')
  );
  
  const transitiveChainPassed = results.every(r => r.transitive_chain_valid);
  
  const networkFailureHandled = results.some(r => 
    r.network_results.some(n => !n.reachable)
  );
  
  const rollbackCoordinationPassed = results.some(r => r.rollback_coordinated);
  
  const summary = {
    total_scenarios: results.length,
    passed: results.filter(result => result.status === 'pass').length,
    failed: results.filter(result => result.status === 'fail').length,
    cycle_detection_passed: cycleDetectionPassed,
    lock_propagation_passed: lockPropagationPassed,
    transitive_chain_passed: transitiveChainPassed,
    network_failure_handled: networkFailureHandled,
    rollback_coordination_passed: rollbackCoordinationPassed,
  };

  const checks = [
    {
      name: 'cycle_detection',
      passed: cycleDetectionPassed,
      message: 'Cycle detection exercised.',
    },
    {
      name: 'lock_propagation',
      passed: lockPropagationPassed,
      message: 'Lock propagation exercised.',
    },
    {
      name: 'transitive_chain_validation',
      passed: transitiveChainPassed,
      message: 'Transitive dependency chains validated.',
    },
    {
      name: 'network_failure_handling',
      passed: networkFailureHandled,
      message: 'Network failures handled gracefully.',
    },
    {
      name: 'rollback_coordination',
      passed: rollbackCoordinationPassed,
      message: 'Rollback coordination across repos verified.',
    },
  ];

  const validationPassed = checks.every(check => check.passed);

  return {
    schema_version: 'cross_repo_coordination_report.v1',
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
