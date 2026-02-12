import { z } from 'zod';

export interface DistributedInstance {
  id: string;
  zone?: string;
  weight?: number;
}

export interface DistributedPartition {
  id: string;
  instance_ids: string[];
  proposal: string;
}

export interface DistributedScenario {
  scenario_id: string;
  instances: DistributedInstance[];
  partitions: DistributedPartition[];
  quorum_size?: number;
}

export interface DistributedPartitionResult {
  partition_id: string;
  instance_ids: string[];
  proposal: string;
  quorum_met: boolean;
}

export interface DistributedScenarioResult {
  scenario_id: string;
  quorum_size: number;
  total_instances: number;
  result: 'consensus' | 'no_quorum' | 'split_brain';
  leader_proposal: string | null;
  partition_results: DistributedPartitionResult[];
  notes: string[];
}

export const distributedExecutionReportSchema = z.object({
  schema_version: z.literal('distributed_execution_report.v1'),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_scenarios: z.number().int().nonnegative(),
    consensus: z.number().int().nonnegative(),
    no_quorum: z.number().int().nonnegative(),
    split_brain: z.number().int().nonnegative(),
  }),
  scenarios: z.array(
    z.object({
      scenario_id: z.string().min(1),
      quorum_size: z.number().int().positive(),
      total_instances: z.number().int().positive(),
      result: z.enum(['consensus', 'no_quorum', 'split_brain']),
      leader_proposal: z.string().nullable(),
      partition_results: z.array(
        z.object({
          partition_id: z.string().min(1),
          instance_ids: z.array(z.string().min(1)),
          proposal: z.string().min(1),
          quorum_met: z.boolean(),
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
  fa_006_status: z.enum(['pass', 'fail']),
});

export type DistributedExecutionReport = z.infer<typeof distributedExecutionReportSchema>;

function normalizeInstances(instances: DistributedInstance[]): DistributedInstance[] {
  return [...instances].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizePartitions(partitions: DistributedPartition[]): DistributedPartition[] {
  return [...partitions].sort((left, right) => left.id.localeCompare(right.id));
}

function quorumFromScenario(scenario: DistributedScenario): number {
  const total = scenario.instances.length;
  if (total === 0) return 1;
  const computed = Math.floor(total / 2) + 1;
  return scenario.quorum_size && scenario.quorum_size > 0 ? scenario.quorum_size : computed;
}

export function evaluateScenario(scenario: DistributedScenario): DistributedScenarioResult {
  const instances = normalizeInstances(scenario.instances);
  const partitions = normalizePartitions(scenario.partitions);
  const quorum = quorumFromScenario(scenario);
  const notes: string[] = [];

  const partitionResults: DistributedPartitionResult[] = partitions.map(partition => {
    const uniqueInstances = [...new Set(partition.instance_ids)].sort();
    const validInstances = uniqueInstances.filter(id => instances.some(instance => instance.id === id));
    const quorumMet = validInstances.length >= quorum;
    if (validInstances.length !== uniqueInstances.length) {
      notes.push(`Partition ${partition.id} references unknown instances.`);
    }
    return {
      partition_id: partition.id,
      instance_ids: validInstances,
      proposal: partition.proposal,
      quorum_met: quorumMet,
    };
  });

  const quorumPartitions = partitionResults.filter(result => result.quorum_met);
  let result: DistributedScenarioResult['result'] = 'no_quorum';
  let leaderProposal: string | null = null;

  if (quorumPartitions.length === 0) {
    result = 'no_quorum';
    notes.push('No partition reached quorum.');
  } else if (quorumPartitions.length === 1) {
    result = 'consensus';
    leaderProposal = quorumPartitions[0].proposal;
    notes.push(`Consensus reached on proposal: ${leaderProposal}.`);
  } else {
    const uniqueProposals = new Set(quorumPartitions.map(partition => partition.proposal));
    if (uniqueProposals.size === 1) {
      result = 'split_brain';
      leaderProposal = quorumPartitions[0].proposal;
      notes.push('Multiple partitions reached quorum with the same proposal (split-brain risk).');
    } else {
      result = 'split_brain';
      notes.push('Split-brain detected: multiple partitions reached quorum with conflicting proposals.');
    }
  }

  return {
    scenario_id: scenario.scenario_id,
    quorum_size: quorum,
    total_instances: instances.length,
    result,
    leader_proposal: leaderProposal,
    partition_results: partitionResults,
    notes,
  };
}

export function buildDistributedExecutionReport(
  scenarios: DistributedScenario[]
): DistributedExecutionReport {
  const results = scenarios.map(evaluateScenario);
  const summary = {
    total_scenarios: results.length,
    consensus: results.filter(result => result.result === 'consensus').length,
    no_quorum: results.filter(result => result.result === 'no_quorum').length,
    split_brain: results.filter(result => result.result === 'split_brain').length,
  };

  const checks = [
    {
      name: 'consensus_covered',
      passed: summary.consensus > 0,
      message: summary.consensus > 0 ? 'Consensus scenario observed.' : 'No consensus scenario observed.',
    },
    {
      name: 'split_brain_detected',
      passed: summary.split_brain > 0,
      message:
        summary.split_brain > 0
          ? 'Split-brain detection exercised.'
          : 'No split-brain scenarios detected.',
    },
    {
      name: 'no_quorum_detected',
      passed: summary.no_quorum > 0,
      message: summary.no_quorum > 0 ? 'No-quorum scenario observed.' : 'No no-quorum scenario observed.',
    },
  ];

  const validationPassed = checks.every(check => check.passed);

  return {
    schema_version: 'distributed_execution_report.v1',
    generated_at: new Date().toISOString(),
    summary,
    scenarios: results,
    validation: {
      passed: validationPassed,
      checks,
    },
    fa_006_status: validationPassed ? 'pass' : 'fail',
  };
}
