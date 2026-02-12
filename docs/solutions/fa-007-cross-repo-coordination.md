---
title: "FA-007 Cross-Repository Coordination Validation"
category: "correctness"
tags:
  - "cross-repo"
  - "coordination"
  - "FA-007"
  - "workflow-orchestration"
date: "2026-02-12"
trigger: "Implementing production validation for FA-007 cross-repo workflow coordination"
---

# Problem
FA-007 requires demonstrating production-grade cross-repo workflow orchestration capabilities for multi-repository AI pipelines. The existing implementation only supported basic dependency tracking and lock propagation. Production validation needed to demonstrate:

1. Multi-repo workflow orchestration with 3+ interconnected repositories
2. Transitive dependency chain validation
3. Network failure handling between repos
4. Coordinated rollback across repo boundaries
5. Cycle detection in dependency graphs

# Solution Pattern
Extended the cross-repo coordination system with comprehensive production validation features:

1. **Enhanced Type System**: Added execution states, network states, and rollback states to track cross-repo operations
2. **Iterative Execution Engine**: Replaced recursive execution with iterative algorithm to handle cycles safely
3. **Network Failure Simulation**: Added support for simulating network partitions between repositories
4. **Coordinated Rollback**: Implemented rollback coordination that affects all repos in a transaction when failures occur
5. **Comprehensive Report Schema**: Created `cross_repo_coordination_report.v1` with detailed scenario results

# Key Insight
The smallest principle that made the solution work: **Treat cross-repo coordination as a distributed transaction problem**. By tracking execution states across all repos and using reverse dependency mapping, rollback coordination can propagate failures correctly across repo boundaries.

# Implementation References
- Files touched:
  - `packages/core/src/dtu/cross-repo-coordination.ts` - Core coordination logic
  - `packages/core/src/dtu/cross-repo-coordination.test.ts` - Comprehensive test scenarios
  - `packages/cli/src/index.ts` - Added `cross-repo:validate` CLI command
  - `scripts/self-host-cross-repo-test.js` - Production validation script
  - `docs/plans/fa-007-cross-repo-coordination.md` - Implementation plan

- Tests added/updated:
  - 17 comprehensive test scenarios covering:
    - Basic lock propagation (3 tests)
    - Multi-repo scenarios with 3+ repos (4 tests)
    - Repo A depends on Repo B workflow completion (2 tests)
    - Lock state propagation across repos (2 tests)
    - Failure handling when dependent repo fails (2 tests)
    - Rollback coordination across repos (2 tests)
    - Network failure handling (2 tests)
    - Comprehensive coordination report (1 test)

# Validation Evidence
- What validated correctness:
  - All 17 unit tests pass
  - Lint passes: `npm run lint` ✓
  - Typecheck passes: `npm run typecheck` ✓
  - Production validation script runs successfully
  - CLI command `factorial cross-repo:validate` works correctly

- What validated reliability over time:
  - Cycle detection prevents infinite loops
  - Iterative execution avoids stack overflow
  - Network failure simulation handles edge cases
  - Rollback coordination respects transaction boundaries

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern
- Update location: Cross-repo coordination section in AGENTS.md

# Reuse Guidance
- When to apply this pattern:
  - Multi-repository workflow orchestration
  - Dependency management across service boundaries
  - Coordinated deployment/rollback scenarios
  - Network partition handling in distributed systems

- When not to apply:
  - Single repository workflows (overkill)
  - Real-time coordination requirements (simulation-based)
  - Systems requiring immediate consistency (eventual consistency model)

- Known tradeoffs:
  - Simulation-based approach is deterministic but not real-time
  - Rollback coordination requires explicit `simulate_rollback` flag
  - Network state simulation is simplified (binary reachable/unreachable)
