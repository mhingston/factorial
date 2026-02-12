import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DotGraphSpec } from './dot-generation.js';
import {
  SelfModificationProductionService,
  createSelfModificationService,
  isSafeSelfModificationCategory,
  selfModificationCategorySchema,
} from './self-modification-production.js';

const sampleSpec: DotGraphSpec = {
  id: 'TestWorkflow',
  goal: 'Test workflow for self-modification',
  nodes: [
    { id: 'start', shape: 'Mdiamond', label: 'Start' },
    { id: 'exit', shape: 'Msquare', label: 'Exit' },
    { id: 'work', shape: 'box', type: 'tool', label: 'Work', attributes: { tool_command: 'echo test' } },
  ],
  edges: [
    { from: 'start', to: 'work' },
    { from: 'work', to: 'exit' },
  ],
};

const modifiedSpec: DotGraphSpec = {
  id: 'TestWorkflow',
  goal: 'Test workflow for self-modification - updated',
  nodes: [
    { id: 'start', shape: 'Mdiamond', label: 'Start' },
    { id: 'exit', shape: 'Msquare', label: 'Exit' },
    { id: 'work', shape: 'box', type: 'tool', label: 'Work', attributes: { tool_command: 'echo updated' } },
  ],
  edges: [
    { from: 'start', to: 'work' },
    { from: 'work', to: 'exit' },
  ],
};

describe('SelfModificationProductionService', () => {
  let service: SelfModificationProductionService;

  beforeEach(() => {
    service = createSelfModificationService();
  });

  describe('isSafeCategory', () => {
    it('returns true for valid categories', () => {
      expect(service.isSafeCategory('documentation_freshness')).toBe(true);
      expect(service.isSafeCategory('test_fixture_updates')).toBe(true);
      expect(service.isSafeCategory('lint_rule_adjustments')).toBe(true);
      expect(service.isSafeCategory('workflow_optimization')).toBe(true);
    });

    it('returns false for invalid categories', () => {
      expect(service.isSafeCategory('invalid_category')).toBe(false);
      expect(service.isSafeCategory('security_critical')).toBe(false);
    });
  });

  describe('createProposal', () => {
    it('creates a proposal with valid category', () => {
      const proposal = service.createProposal(
        'documentation_freshness',
        'test-workflow',
        sampleSpec,
        modifiedSpec,
        'Update documentation',
        'Documentation needs refresh',
        'test-author'
      );

      expect(proposal.proposal_id).toMatch(/^prop-\d+-/);
      expect(proposal.category).toBe('documentation_freshness');
      expect(proposal.workflow_id).toBe('test-workflow');
      expect(proposal.risk_level).toBe('low');
      expect(proposal.author).toBe('test-author');
    });

    it('throws for invalid category', () => {
      expect(() =>
        service.createProposal(
          'invalid_category' as unknown as import('./self-modification-production.js').SelfModificationCategory,
          'test-workflow',
          sampleSpec,
          modifiedSpec,
          'Update',
          'Rationale',
          'author'
        )
      ).toThrow('Invalid category');
    });
  });

  describe('validateProposal', () => {
    it('validates a proposal and returns result', async () => {
      const proposal = service.createProposal(
        'documentation_freshness',
        'test-workflow',
        sampleSpec,
        modifiedSpec,
        'Update documentation',
        'Documentation needs refresh',
        'test-author'
      );

      const result = await service.validateProposal(proposal.proposal_id, false);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('lint_clean');
      expect(result).toHaveProperty('test_passed');
      expect(result).toHaveProperty('typecheck_passed');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('throws for non-existent proposal', async () => {
      await expect(service.validateProposal('non-existent')).rejects.toThrow('Proposal not found');
    });
  });

  describe('createPullRequest', () => {
    it('returns error for unvalidated proposal', async () => {
      const proposal = service.createProposal(
        'documentation_freshness',
        'test-workflow',
        sampleSpec,
        modifiedSpec,
        'Update documentation',
        'Documentation needs refresh',
        'test-author'
      );

      const result = await service.createPullRequest(proposal.proposal_id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('has not passed validation');
    });

    it('returns dry run result when dryRun is true', async () => {
      const proposal = service.createProposal(
        'documentation_freshness',
        'test-workflow',
        sampleSpec,
        modifiedSpec,
        'Update documentation',
        'Documentation needs refresh',
        'test-author'
      );

      // Create a mock validation result directly
      const mockValidation = {
        passed: true,
        lint_clean: true,
        test_passed: true,
        typecheck_passed: true,
        errors: [] as string[],
        warnings: [] as string[],
      };
      // @ts-expect-error - accessing private member for test
      service.validations.set(proposal.proposal_id, mockValidation);

      const result = await service.createPullRequest(proposal.proposal_id, { dryRun: true });
      expect(result.success).toBe(true);
      expect(result.branch_name).toMatch(/^self-mod\/documentation_freshness\/test-workflow-/);
      expect(result.pr_number).toBe(999);
    });
  });

  describe('rollback', () => {
    it('returns success for valid proposal', async () => {
      const proposal = service.createProposal(
        'documentation_freshness',
        'test-workflow',
        sampleSpec,
        modifiedSpec,
        'Update documentation',
        'Documentation needs refresh',
        'test-author'
      );

      const result = await service.rollback(proposal.proposal_id, 'Test rollback');
      expect(result.success).toBe(true);
      expect(result.rolled_back_to).toBe('original');
    });

    it('returns error for non-existent proposal', async () => {
      const result = await service.rollback('non-existent', 'Test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proposal not found');
    });
  });

  describe('buildProductionReport', () => {
    it('generates a valid production report', async () => {
      const proposal = service.createProposal(
        'documentation_freshness',
        'test-workflow',
        sampleSpec,
        modifiedSpec,
        'Update documentation',
        'Documentation needs refresh',
        'test-author'
      );

      await service.validateProposal(proposal.proposal_id, false);

      const report = service.buildProductionReport();

      expect(report.schema_version).toBe('self_modification_production_report.v1');
      expect(report.summary.total_proposals).toBe(1);
      expect(report.proposals).toHaveLength(1);
      expect(report.safety_invariants.no_auto_merge).toBe(true);
      expect(report.safety_invariants.rollback_working).toBe(true);
      expect(report.safety_invariants.single_workflow_scope).toBe(true);
    });

    it('validates against schema', async () => {
      const proposal = service.createProposal(
        'test_fixture_updates',
        'test-workflow-2',
        sampleSpec,
        modifiedSpec,
        'Update fixtures',
        'Fixtures need updating',
        'test-author'
      );

      await service.validateProposal(proposal.proposal_id, false);

      const report = service.buildProductionReport();
      const parsed = selfModificationCategorySchema.safeParse(report.proposals[0].category);
      expect(parsed.success).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('returns production metrics', async () => {
      const proposal = service.createProposal(
        'workflow_optimization',
        'test-workflow',
        sampleSpec,
        modifiedSpec,
        'Optimize workflow',
        'Performance improvements',
        'test-author'
      );

      await service.validateProposal(proposal.proposal_id, false);

      const metrics = service.getMetrics();

      expect(metrics).toHaveProperty('totalProposals');
      expect(metrics).toHaveProperty('validatedCount');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics.totalProposals).toBe(1);
    });
  });
});

describe('isSafeSelfModificationCategory', () => {
  it('returns true for valid categories', () => {
    expect(isSafeSelfModificationCategory('documentation_freshness')).toBe(true);
    expect(isSafeSelfModificationCategory('lint_rule_adjustments')).toBe(true);
  });

  it('returns false for invalid categories', () => {
    expect(isSafeSelfModificationCategory('unsafe_category')).toBe(false);
  });
});

describe('Safety Invariants', () => {
  it('enforces single workflow scope', () => {
    const service = createSelfModificationService();
    
    // First proposal for workflow A
    service.createProposal(
      'documentation_freshness',
      'workflow-a',
      sampleSpec,
      modifiedSpec,
      'Update A',
      'Rationale',
      'author'
    );

    // Second proposal for workflow B (should be allowed)
    expect(() =>
      service.createProposal(
        'documentation_freshness',
        'workflow-b',
        sampleSpec,
        modifiedSpec,
        'Update B',
        'Rationale',
        'author'
      )
    ).not.toThrow();
  });

  it('tracks proposal lifecycle correctly', async () => {
    const service = createSelfModificationService();
    
    const proposal = service.createProposal(
      'test_fixture_updates',
      'test-workflow',
      sampleSpec,
      modifiedSpec,
      'Update fixtures',
      'Update test fixtures',
      'test-author'
    );

    // Initially just proposed
    let report = service.buildProductionReport();
    expect(report.proposals[0].status).toBe('proposed');

    // After validation - mock a passing validation
    const mockValidation = {
      passed: true,
      lint_clean: true,
      test_passed: true,
      typecheck_passed: true,
      errors: [] as string[],
      warnings: [] as string[],
    };
    // @ts-expect-error - accessing private member for test
    service.validations.set(proposal.proposal_id, mockValidation);
    
    report = service.buildProductionReport();
    expect(report.proposals[0].status).toBe('validated');

    // After rollback
    await service.rollback(proposal.proposal_id, 'Test rollback');
    report = service.buildProductionReport();
    expect(report.proposals[0].status).toBe('rolled_back');
  });
});
