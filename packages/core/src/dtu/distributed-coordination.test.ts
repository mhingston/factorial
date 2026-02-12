import { describe, expect, it } from 'vitest';
import {
  type DistributedScenario,
  buildDistributedConsensusReport,
  buildDistributedExecutionReport,
  detectSplitBrain,
  evaluateConsensusScenario,
  evaluateScenario,
  simulateRaftLeaderElection,
  simulateStateReplication,
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

describe('distributed-consensus', () => {
  describe('leader election', () => {
    it('elects leader with 3 instances', () => {
      const instances = [
        { id: 'node-1', state: 'follower' as const, term: 0 },
        { id: 'node-2', state: 'follower' as const, term: 0 },
        { id: 'node-3', state: 'follower' as const, term: 0 },
      ];

      const result = simulateRaftLeaderElection(instances, 'partition-1');
      
      expect(result.elected).toBe(true);
      expect(result.leader_id).toBeDefined();
      expect(result.votes_received).toBeGreaterThanOrEqual(result.votes_required);
      expect(result.term).toBe(1);
      expect(result.candidates).toHaveLength(3);
    });

    it('elects leader with 5 instances', () => {
      const instances = [
        { id: 'node-1', state: 'follower' as const, term: 0, weight: 1 },
        { id: 'node-2', state: 'follower' as const, term: 0, weight: 2 },
        { id: 'node-3', state: 'follower' as const, term: 0, weight: 1 },
        { id: 'node-4', state: 'follower' as const, term: 0, weight: 1 },
        { id: 'node-5', state: 'follower' as const, term: 0, weight: 1 },
      ];

      const result = simulateRaftLeaderElection(instances, 'partition-1');
      
      expect(result.elected).toBe(true);
      expect(result.leader_id).toBe('node-2'); // Highest weight
      expect(result.votes_required).toBe(3);
      expect(result.votes_received).toBe(5);
    });

    it('handles leader election with offline instances', () => {
      const instances = [
        { id: 'node-1', state: 'leader' as const, term: 1 },
        { id: 'node-2', state: 'follower' as const, term: 1 },
        { id: 'node-3', state: 'offline' as const, term: 1 },
      ];

      const result = simulateRaftLeaderElection(instances, 'partition-1');
      
      // Should still elect with 2/3 votes
      expect(result.elected).toBe(true);
      expect(result.candidates).toHaveLength(2);
    });
  });

  describe('state replication', () => {
    it('replicates state across all instances', () => {
      const instances = [
        { id: 'node-1', state: 'leader' as const },
        { id: 'node-2', state: 'follower' as const },
        { id: 'node-3', state: 'follower' as const },
      ];

      const entries = [
        { index: 1, term: 1, command: 'SET x=1' },
        { index: 2, term: 1, command: 'SET y=2' },
      ];

      const result = simulateStateReplication(instances, 'node-1', entries);
      
      expect(result.replicated).toBe(true);
      expect(result.replication_factor).toBe(3);
      expect(result.commit_index).toBe(2);
      expect(result.inconsistencies).toHaveLength(0);
      expect(Object.keys(result.match_indices)).toHaveLength(3);
    });

    it('detects inconsistencies during partition', () => {
      const instances = [
        { id: 'node-1', state: 'leader' as const },
        { id: 'node-2', state: 'follower' as const },
        { id: 'node-3', state: 'follower' as const },
        { id: 'node-4', state: 'follower' as const },
        { id: 'node-5', state: 'follower' as const },
      ];

      const entries = [
        { index: 1, term: 1, command: 'SET x=1' },
        { index: 2, term: 1, command: 'SET y=2' },
      ];

      const result = simulateStateReplication(instances, 'node-1', entries, 'split-brain-scenario');
      
      // During split-brain, some followers may lag
      expect(result.inconsistencies.length).toBeGreaterThan(0);
      // Replication may or may not achieve quorum depending on lag distribution
      expect(result.replication_factor).toBeGreaterThan(0);
    });
  });

  describe('split-brain detection', () => {
    it('detects no split-brain with single partition', () => {
      const partitions = [
        { partition_id: 'p1', instance_ids: ['a', 'b', 'c'], proposal: 'p1', quorum_met: true },
      ];

      const result = detectSplitBrain(partitions, 2);
      
      expect(result.detected).toBe(false);
      expect(result.type).toBe('none');
    });

    it('detects split-brain with conflicting proposals', () => {
      const partitions = [
        { partition_id: 'p1', instance_ids: ['a', 'b'], proposal: 'proposal-a', quorum_met: true },
        { partition_id: 'p2', instance_ids: ['c', 'd'], proposal: 'proposal-b', quorum_met: true },
      ];

      const result = detectSplitBrain(partitions, 2);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('conflicting_proposals');
    });

    it('detects split-brain with same proposals', () => {
      const partitions = [
        { partition_id: 'p1', instance_ids: ['a', 'b'], proposal: 'proposal-x', quorum_met: true },
        { partition_id: 'p2', instance_ids: ['c', 'd'], proposal: 'proposal-x', quorum_met: true },
      ];

      const result = detectSplitBrain(partitions, 2);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('same_proposal');
    });
  });

  describe('consensus scenarios', () => {
    it('handles leader election scenario with 3 instances', () => {
      const scenario: DistributedScenario = {
        scenario_id: 'leader-election-3',
        description: 'Leader election with 3 instances',
        instances: [
          { id: 'node-1', state: 'follower', term: 0 },
          { id: 'node-2', state: 'follower', term: 0 },
          { id: 'node-3', state: 'follower', term: 0 },
        ],
        partitions: [
          { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'leader-node-2' },
        ],
      };

      const result = evaluateConsensusScenario(scenario);
      
      expect(result.result).toBe('consensus');
      expect(result.leader_election?.elected).toBe(true);
      expect(result.leader_election?.votes_required).toBe(2);
      expect(result.state_replication?.replicated).toBe(true);
    });

    it('handles network partition with split-brain', () => {
      const scenario: DistributedScenario = {
        scenario_id: 'network-partition-split-brain',
        description: 'Network partition causing split-brain',
        instances: [
          { id: 'node-1', state: 'leader', term: 1 },
          { id: 'node-2', state: 'follower', term: 1 },
          { id: 'node-3', state: 'leader', term: 1 },
          { id: 'node-4', state: 'follower', term: 1 },
        ],
        partitions: [
          { id: 'p1', instance_ids: ['node-1', 'node-2'], proposal: 'config-a' },
          { id: 'p2', instance_ids: ['node-3', 'node-4'], proposal: 'config-b' },
        ],
        quorum_size: 2,
      };

      const result = evaluateConsensusScenario(scenario);
      
      expect(result.result).toBe('split_brain');
      expect(result.notes.some(n => n.includes('Split-brain'))).toBe(true);
    });

    it('handles quorum requirements validation', () => {
      const scenario: DistributedScenario = {
        scenario_id: 'quorum-requirements',
        description: 'Validating quorum requirements',
        instances: [
          { id: 'node-1' },
          { id: 'node-2' },
          { id: 'node-3' },
          { id: 'node-4' },
          { id: 'node-5' },
        ],
        partitions: [
          { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'proposal-x' },
        ],
        quorum_size: 3,
      };

      const result = evaluateConsensusScenario(scenario);
      
      expect(result.quorum_size).toBe(3);
      expect(result.result).toBe('consensus');
      expect(result.partition_results[0].quorum_met).toBe(true);
    });

    it('handles leader failover scenario', () => {
      const scenario: DistributedScenario = {
        scenario_id: 'leader-failover',
        description: 'Leader failover when leader fails',
        instances: [
          { id: 'node-1', state: 'offline', term: 1 },
          { id: 'node-2', state: 'follower', term: 1 },
          { id: 'node-3', state: 'follower', term: 1 },
        ],
        partitions: [
          { id: 'p1', instance_ids: ['node-2', 'node-3'], proposal: 'new-leader' },
        ],
      };

      const result = evaluateConsensusScenario(scenario);
      
      expect(result.failover_detected).toBe(true);
      expect(result.result).toBe('consensus');
      expect(result.leader_election?.elected).toBe(true);
    });

    it('handles state consistency validation', () => {
      const scenario: DistributedScenario = {
        scenario_id: 'state-consistency',
        description: 'State consistency across instances',
        instances: [
          { id: 'node-1', state: 'leader', term: 2 },
          { id: 'node-2', state: 'follower', term: 2 },
          { id: 'node-3', state: 'follower', term: 2 },
          { id: 'node-4', state: 'follower', term: 2 },
          { id: 'node-5', state: 'follower', term: 2 },
        ],
        partitions: [
          { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'], proposal: 'committed-state' },
        ],
      };

      const result = evaluateConsensusScenario(scenario);
      
      expect(result.state_replication?.replicated).toBe(true);
      expect(result.state_replication?.commit_index).toBeGreaterThan(0);
    });

    it('handles 5-instance consensus', () => {
      const scenario: DistributedScenario = {
        scenario_id: 'consensus-5-instances',
        description: 'Consensus with 5 instances and weighted leader election',
        instances: [
          { id: 'node-1', state: 'follower', term: 0, weight: 3 },
          { id: 'node-2', state: 'follower', term: 0, weight: 2 },
          { id: 'node-3', state: 'follower', term: 0, weight: 1 },
          { id: 'node-4', state: 'follower', term: 0, weight: 1 },
          { id: 'node-5', state: 'follower', term: 0, weight: 1 },
        ],
        partitions: [
          { id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'weighted-leader' },
        ],
      };

      const result = evaluateConsensusScenario(scenario);
      
      expect(result.result).toBe('consensus');
      expect(result.total_instances).toBe(5);
      expect(result.leader_election?.elected).toBe(true);
      // Leader should be node-1 with highest weight
      expect(result.leader_election?.leader_id).toBe('node-1');
    });
  });

  describe('consensus report', () => {
    it('builds comprehensive consensus report', () => {
      const scenarios: DistributedScenario[] = [
        {
          scenario_id: 'leader-election-3',
          description: 'Leader election with 3 instances',
          instances: [
            { id: 'node-1', state: 'follower', term: 0 },
            { id: 'node-2', state: 'follower', term: 0 },
            { id: 'node-3', state: 'follower', term: 0 },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'leader' }],
        },
        {
          scenario_id: 'network-partition-split-brain',
          description: 'Network partition causing split-brain',
          instances: [
            { id: 'node-1', state: 'leader', term: 1 },
            { id: 'node-2', state: 'follower', term: 1 },
            { id: 'node-3', state: 'leader', term: 1 },
            { id: 'node-4', state: 'follower', term: 1 },
          ],
          partitions: [
            { id: 'p1', instance_ids: ['node-1', 'node-2'], proposal: 'config-a' },
            { id: 'p2', instance_ids: ['node-3', 'node-4'], proposal: 'config-b' },
          ],
          quorum_size: 2,
        },
        {
          scenario_id: 'quorum-requirements',
          description: 'Validating quorum requirements',
          instances: [
            { id: 'node-1' }, { id: 'node-2' }, { id: 'node-3' },
            { id: 'node-4' }, { id: 'node-5' },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'p1' }],
          quorum_size: 3,
        },
        {
          scenario_id: 'leader-failover',
          description: 'Leader failover when leader fails',
          instances: [
            { id: 'node-1', state: 'offline', term: 1 },
            { id: 'node-2', state: 'follower', term: 1 },
            { id: 'node-3', state: 'follower', term: 1 },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-2', 'node-3'], proposal: 'failover' }],
        },
        {
          scenario_id: 'state-consistency',
          description: 'State consistency across instances',
          instances: [
            { id: 'node-1', state: 'leader', term: 2 },
            { id: 'node-2', state: 'follower', term: 2 },
            { id: 'node-3', state: 'follower', term: 2 },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'consistent' }],
        },
      ];

      const report = buildDistributedConsensusReport(scenarios);
      
      expect(report.schema_version).toBe('distributed_consensus_report.v1');
      expect(report.summary.total_scenarios).toBe(5);
      expect(report.test_coverage.leader_election_3plus).toBe(true);
      expect(report.test_coverage.network_partition_split_brain).toBe(true);
      expect(report.test_coverage.quorum_requirements).toBe(true);
      expect(report.test_coverage.leader_failover).toBe(true);
      expect(report.test_coverage.state_consistency).toBe(true);
      expect(report.validation.passed).toBe(true);
      expect(report.fa_006_status).toBe('pass');
    });

    it('validates all test coverage requirements', () => {
      const scenarios: DistributedScenario[] = [
        {
          scenario_id: 'leader-election-3',
          description: 'Leader election with 3 instances',
          instances: [
            { id: 'node-1', state: 'follower', term: 0 },
            { id: 'node-2', state: 'follower', term: 0 },
            { id: 'node-3', state: 'follower', term: 0 },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'leader' }],
        },
        {
          scenario_id: 'network-partition-split-brain',
          description: 'Network partition causing split-brain',
          instances: [
            { id: 'node-1', state: 'leader', term: 1 },
            { id: 'node-2', state: 'follower', term: 1 },
            { id: 'node-3', state: 'leader', term: 1 },
            { id: 'node-4', state: 'follower', term: 1 },
          ],
          partitions: [
            { id: 'p1', instance_ids: ['node-1', 'node-2'], proposal: 'config-a' },
            { id: 'p2', instance_ids: ['node-3', 'node-4'], proposal: 'config-b' },
          ],
          quorum_size: 2,
        },
        {
          scenario_id: 'quorum-requirements',
          description: 'Validating quorum requirements',
          instances: [
            { id: 'node-1' }, { id: 'node-2' }, { id: 'node-3' },
            { id: 'node-4' }, { id: 'node-5' },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'p1' }],
          quorum_size: 3,
        },
        {
          scenario_id: 'leader-failover',
          description: 'Leader failover when leader fails',
          instances: [
            { id: 'node-1', state: 'offline', term: 1 },
            { id: 'node-2', state: 'follower', term: 1 },
            { id: 'node-3', state: 'follower', term: 1 },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-2', 'node-3'], proposal: 'failover' }],
        },
        {
          scenario_id: 'state-consistency',
          description: 'State consistency across instances',
          instances: [
            { id: 'node-1', state: 'leader', term: 2 },
            { id: 'node-2', state: 'follower', term: 2 },
            { id: 'node-3', state: 'follower', term: 2 },
          ],
          partitions: [{ id: 'p1', instance_ids: ['node-1', 'node-2', 'node-3'], proposal: 'consistent' }],
        },
      ];

      const report = buildDistributedConsensusReport(scenarios);
      
      // Verify all coverage areas
      expect(report.test_coverage.leader_election_3plus).toBe(true);
      expect(report.test_coverage.network_partition_split_brain).toBe(true);
      expect(report.test_coverage.quorum_requirements).toBe(true);
      expect(report.test_coverage.leader_failover).toBe(true);
      expect(report.test_coverage.state_consistency).toBe(true);
      
      // Verify summary counts
      expect(report.summary.leader_election_success).toBeGreaterThan(0);
      expect(report.summary.state_consistency_achieved).toBeGreaterThan(0);
      
      // Verify validation
      expect(report.validation.checks).toHaveLength(5);
      expect(report.validation.passed).toBe(true);
    });
  });
});
