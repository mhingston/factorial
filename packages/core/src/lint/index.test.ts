import { describe, expect, it } from 'vitest';
import { createDefaultLintEngine } from './index.js';
import type { Graph, Node, Edge } from '../types/index.js';

describe('LintEngine', () => {
  it('reports missing start and exit nodes', () => {
    const nodes = new Map<string, Node>([
      [
        'a',
        {
          id: 'a',
          type: 'tool',
          shape: 'parallelogram',
          label: 'a',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('START_NODE_COUNT');
    expect(codes).toContain('EXIT_NODE_COUNT');
  });

  it('reports multiple exit nodes as invalid', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'work',
        {
          id: 'work',
          type: 'tool',
          shape: 'parallelogram',
          label: 'work',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exitA',
        {
          id: 'exitA',
          type: 'exit',
          shape: 'Msquare',
          label: 'exitA',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exitB',
        {
          id: 'exitB',
          type: 'exit',
          shape: 'doublecircle',
          label: 'exitB',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'work', weight: 0, attributes: {} },
      { from: 'work', to: 'exitA', weight: 0, attributes: {} },
      { from: 'work', to: 'exitB', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const exitDiag = diagnostics.find(d => d.code === 'EXIT_NODE_COUNT');

    expect(exitDiag).toBeDefined();
    expect(exitDiag?.message).toContain('found 2');
  });

  it('reports stylesheet and codergen config errors', () => {
    const nodes = new Map<string, Node>([
      [
        'codergen',
        {
          id: 'codergen',
          type: 'codergen',
          shape: 'box',
          label: 'codergen',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [{ from: 'codergen', to: 'exit', weight: 0, attributes: {} }];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
      model_stylesheet: 'box { llm_provider: openai ',
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('STYLESHEET_INVALID');
    expect(codes).toContain('LLM_PROVIDER_MISSING');
    expect(codes).toContain('LLM_MODEL_MISSING');
  });

  it('warns for stylesheet selectors with no matches', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [{ from: 'start', to: 'exit', weight: 0, attributes: {} }];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
      model_stylesheet: '.missing { llm_model: gpt-4o; }',
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('STYLESHEET_SELECTOR_MISSING');
  });

  it('requires output schema when codergen output contract is required', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'work',
        {
          id: 'work',
          type: 'codergen',
          shape: 'box',
          label: 'work',
          max_retries: 0,
          goal_gate: false,
          llm_provider: 'openai',
          llm_model: 'gpt-4o-mini',
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            output_contract_required: 'true',
          },
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'work', weight: 0, attributes: {} },
      { from: 'work', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('OUTPUT_SCHEMA_REQUIRED');
  });

  it('requires merge_strategy for fan-in nodes with multiple incoming edges', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'a',
        {
          id: 'a',
          type: 'tool',
          shape: 'parallelogram',
          label: 'a',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'b',
        {
          id: 'b',
          type: 'tool',
          shape: 'parallelogram',
          label: 'b',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'fan',
        {
          id: 'fan',
          type: 'parallel.fan_in',
          shape: 'tripleoctagon',
          label: 'fan',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'a', weight: 0, attributes: {} },
      { from: 'start', to: 'b', weight: 0, attributes: {} },
      { from: 'a', to: 'fan', weight: 0, attributes: {} },
      { from: 'b', to: 'fan', weight: 0, attributes: {} },
      { from: 'fan', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('FAN_IN_MERGE_STRATEGY_REQUIRED');
  });

  it('requires explicit pass/fail routing for quality.gate nodes', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'gate',
        {
          id: 'gate',
          type: 'quality.gate',
          shape: 'diamond',
          label: 'gate',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            gate_type: 'tests',
          },
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'gate', weight: 0, attributes: {} },
      { from: 'gate', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('QUALITY_GATE_PASS_CONDITION_REQUIRED');
    expect(codes).toContain('QUALITY_GATE_FAILURE_TARGET_REQUIRED');
    expect(codes).toContain('QUALITY_GATE_OUTGOING_EDGES_MISSING');
  });

  it('requires rubric path and threshold for judge.rubric nodes', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'judge',
        {
          id: 'judge',
          type: 'judge.rubric',
          shape: 'box',
          label: 'judge',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'judge', weight: 0, attributes: {} },
      { from: 'judge', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const engine = createDefaultLintEngine();
    const diagnostics = engine.run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('JUDGE_RUBRIC_PATH_REQUIRED');
    expect(codes).toContain('JUDGE_SCORE_THRESHOLD_REQUIRED');
  });

  it('requires class-specific targets for retry_policy=targeted', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'work',
        {
          id: 'work',
          type: 'tool',
          shape: 'parallelogram',
          label: 'work',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            retry_policy: 'targeted',
            retry_classifier_schema: 'not-json',
          },
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'work', weight: 0, attributes: {} },
      { from: 'work', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const diagnostics = createDefaultLintEngine().run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('RETRY_CLASSIFIER_SCHEMA_INVALID');
    expect(codes).toContain('TARGETED_RETRY_TARGETS_MISSING');
  });

  it('validates budget and timeout ceilings as positive numbers', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'work',
        {
          id: 'work',
          type: 'tool',
          shape: 'parallelogram',
          label: 'work',
          max_retries: 0,
          goal_gate: false,
          timeout: 0,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            budget_max_tokens: '0',
            budget_max_cost_usd: '-1',
          },
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'work', weight: 0, attributes: {} },
      { from: 'work', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {
        budget_max_tokens: 'abc',
        budget_max_cost_usd: 0,
        budget_max_duration_ms: -10,
      },
    };

    const diagnostics = createDefaultLintEngine().run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('GRAPH_BUDGET_MAX_TOKENS_INVALID');
    expect(codes).toContain('GRAPH_BUDGET_MAX_COST_USD_INVALID');
    expect(codes).toContain('GRAPH_BUDGET_MAX_DURATION_MS_INVALID');
    expect(codes).toContain('NODE_BUDGET_MAX_TOKENS_INVALID');
    expect(codes).toContain('NODE_BUDGET_MAX_COST_USD_INVALID');
    expect(codes).toContain('NODE_TIMEOUT_INVALID');
  });

  it('enforces strict overlays for canary promotion', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'work',
        {
          id: 'work',
          type: 'codergen',
          shape: 'box',
          label: 'work',
          max_retries: 0,
          goal_gate: false,
          llm_provider: 'openai',
          llm_model: 'gpt-4o-mini',
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'work', weight: 0, attributes: {} },
      { from: 'work', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {
        promotion_stage: 'canary',
        quality_profile: 'baseline',
      },
    };

    const diagnostics = createDefaultLintEngine().run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('QUALITY_PROFILE_TOO_WEAK_FOR_STAGE');
    expect(codes).toContain('STRICT_CODEGEN_CONTRACT_REQUIRED');
    expect(codes).toContain('STRICT_QUALITY_GATE_REQUIRED');
  });

  it('enforces regulated overlays for prod promotion', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'gate',
        {
          id: 'gate',
          type: 'quality.gate',
          shape: 'diamond',
          label: 'gate',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            gate_type: 'custom',
            pass_condition: 'outcome=success',
            failure_target: 'exit',
          },
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'gate', weight: 0, attributes: {} },
      { from: 'gate', to: 'exit', weight: 0, attributes: {}, condition: 'outcome=success' },
      { from: 'gate', to: 'exit', weight: 0, attributes: {}, condition: 'outcome!=success' },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {
        promotion_stage: 'prod',
        quality_profile: 'regulated',
      },
    };

    const diagnostics = createDefaultLintEngine().run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('REGULATED_GATE_TYPE_REQUIRED');
    expect(codes).toContain('REGULATED_JUDGE_REQUIRED');
  });

  it('validates confidence.gate escalation config', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'route',
        {
          id: 'route',
          type: 'confidence.gate',
          shape: 'diamond',
          label: 'route',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            escalation_threshold: 2,
          },
        },
      ],
      [
        'auto',
        {
          id: 'auto',
          type: 'tool',
          shape: 'parallelogram',
          label: 'auto',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'route', weight: 0, attributes: {} },
      { from: 'route', to: 'auto', weight: 0, attributes: {} },
      { from: 'auto', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const diagnostics = createDefaultLintEngine().run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('CONFIDENCE_SIGNAL_PATH_REQUIRED');
    expect(codes).toContain('ESCALATION_THRESHOLD_INVALID');
    expect(codes).toContain('CONFIDENCE_ESCALATION_TARGET_MISSING');
  });

  it('validates stack.manager_loop contract completeness', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'manager',
        {
          id: 'manager',
          type: 'stack.manager_loop',
          shape: 'house',
          label: 'manager',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            stack_child_dotfile: '',
            manager_poll_interval: -1,
            manager_max_cycles: 0,
            manager_actions: 'observe,unknown',
            manager_stop_condition: 'stack.child.status=running',
            manager_require_lock: 'maybe',
          },
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'manager', weight: 0, attributes: {} },
      { from: 'manager', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const diagnostics = createDefaultLintEngine().run(graph);
    const codes = diagnostics.map(d => d.code);

    expect(codes).toContain('MANAGER_CHILD_DOTFILE_REQUIRED');
    expect(codes).toContain('MANAGER_POLL_INTERVAL_INVALID');
    expect(codes).toContain('MANAGER_MAX_CYCLES_INVALID');
    expect(codes).toContain('MANAGER_ACTION_INVALID');
    expect(codes).toContain('MANAGER_STOP_CONDITION_INVALID');
    expect(codes).toContain('MANAGER_REQUIRE_LOCK_INVALID');
  });

  it('requires non-empty manager_child_lock_key when manager_require_lock=true', () => {
    const nodes = new Map<string, Node>([
      [
        'start',
        {
          id: 'start',
          type: 'start',
          shape: 'Mdiamond',
          label: 'start',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
      [
        'manager',
        {
          id: 'manager',
          type: 'stack.manager_loop',
          shape: 'house',
          label: 'manager',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {
            stack_child_dotfile: './child.dot',
            manager_require_lock: 'true',
            manager_child_lock_key: '   ',
          },
        },
      ],
      [
        'exit',
        {
          id: 'exit',
          type: 'exit',
          shape: 'Msquare',
          label: 'exit',
          max_retries: 0,
          goal_gate: false,
          reasoning_effort: 'high',
          auto_status: false,
          allow_partial: false,
          attributes: {},
        },
      ],
    ]);

    const edges: Edge[] = [
      { from: 'start', to: 'manager', weight: 0, attributes: {} },
      { from: 'manager', to: 'exit', weight: 0, attributes: {} },
    ];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
    };

    const diagnostics = createDefaultLintEngine().run(graph);
    const codes = diagnostics.map(d => d.code);
    expect(codes).toContain('MANAGER_CHILD_LOCK_KEY_REQUIRED');
  });
});
