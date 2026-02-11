import type { Graph, Node } from '../types/index.js';
import type { HandlerRegistry } from '../handlers/registry.js';
import { isConditionSyntaxValid } from '../conditions/index.js';
import { parseModelStylesheet, StylesheetError } from '../stylesheet/index.js';
import { SHAPE_TO_TYPE } from '../types/index.js';

export type DiagnosticLevel = 'error' | 'warning' | 'info';

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  nodeId?: string;
  edge?: { from: string; to: string };
}

export interface LintContext {
  handlerRegistry?: HandlerRegistry;
}

export interface LintRule {
  id: string;
  run(graph: Graph, context: LintContext): Diagnostic[];
}

export class LintEngine {
  private rules: LintRule[] = [];

  addRule(rule: LintRule): void {
    this.rules.push(rule);
  }

  run(graph: Graph, context: LintContext = {}): Diagnostic[] {
    return this.rules.flatMap(rule => rule.run(graph, context));
  }
}

export function createDefaultLintEngine(): LintEngine {
  const engine = new LintEngine();
  engine.addRule(new StartNodeRule());
  engine.addRule(new ExitNodeRule());
  engine.addRule(new EdgeTargetRule());
  engine.addRule(new StartNoIncomingRule());
  engine.addRule(new ExitNoOutgoingRule());
  engine.addRule(new ReachabilityRule());
  engine.addRule(new ConditionSyntaxRule());
  engine.addRule(new StylesheetSyntaxRule());
  engine.addRule(new StylesheetSelectorRule());
  engine.addRule(new FidelityValidRule());
  engine.addRule(new RetryTargetExistsRule());
  engine.addRule(new ReasoningEffortRule());
  engine.addRule(new CodergenOutputContractRule());
  engine.addRule(new FanInMergeStrategyRule());
  engine.addRule(new QualityGateRoutingRule());
  engine.addRule(new ConfidenceEscalationRule());
  engine.addRule(new ManagerLoopContractRule());
  engine.addRule(new JudgeRubricRule());
  engine.addRule(new TargetedRetryRule());
  engine.addRule(new BudgetLimitRule());
  engine.addRule(new PromotionProfileRule());
  engine.addRule(new HandlerConfigRule());
  engine.addRule(new TypeKnownRule());
  return engine;
}

const VALID_FIDELITY = new Set(['full', 'compact', 'summary', 'truncate']);

function isStartNode(node: Node): boolean {
  return (
    node.shape === 'Mdiamond' ||
    node.shape === 'circle' ||
    node.type === 'start' ||
    node.id.toLowerCase() === 'start'
  );
}

function isExitNode(node: Node): boolean {
  return node.shape === 'Msquare' || node.shape === 'doublecircle' || node.type === 'exit';
}

class StartNodeRule implements LintRule {
  id = 'start_node';

  run(graph: Graph): Diagnostic[] {
    const starts = Array.from(graph.nodes.values()).filter(isStartNode);
    if (starts.length === 1) return [];
    return [
      {
        level: 'error',
        code: 'START_NODE_COUNT',
        message: `Pipeline must have exactly one start node (found ${starts.length}).`,
      },
    ];
  }
}

class ExitNodeRule implements LintRule {
  id = 'exit_node';

  run(graph: Graph): Diagnostic[] {
    const exits = Array.from(graph.nodes.values()).filter(isExitNode);
    if (exits.length === 1) return [];
    return [
      {
        level: 'error',
        code: 'EXIT_NODE_COUNT',
        message: `Pipeline must have exactly one exit node (found ${exits.length}).`,
      },
    ];
  }
}

class EdgeTargetRule implements LintRule {
  id = 'edge_target';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const edge of graph.edges) {
      if (!graph.nodes.has(edge.from) || !graph.nodes.has(edge.to)) {
        diagnostics.push({
          level: 'error',
          code: 'EDGE_TARGET_MISSING',
          message: `Edge references missing node (${edge.from} -> ${edge.to}).`,
          edge: { from: edge.from, to: edge.to },
        });
      }
    }
    return diagnostics;
  }
}

class StartNoIncomingRule implements LintRule {
  id = 'start_no_incoming';

  run(graph: Graph): Diagnostic[] {
    const starts = Array.from(graph.nodes.values()).filter(isStartNode);
    const incoming = new Map<string, number>();
    for (const edge of graph.edges) {
      incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    }

    return starts
      .filter(start => (incoming.get(start.id) || 0) > 0)
      .map(start => ({
        level: 'error',
        code: 'START_HAS_INCOMING',
        message: 'Start node must not have incoming edges.',
        nodeId: start.id,
      }));
  }
}

class ExitNoOutgoingRule implements LintRule {
  id = 'exit_no_outgoing';

  run(graph: Graph): Diagnostic[] {
    const outgoing = new Map<string, number>();
    for (const edge of graph.edges) {
      outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    }

    return Array.from(graph.nodes.values())
      .filter(node => isExitNode(node) && (outgoing.get(node.id) || 0) > 0)
      .map(node => ({
        level: 'error',
        code: 'EXIT_HAS_OUTGOING',
        message: 'Exit node must not have outgoing edges.',
        nodeId: node.id,
      }));
  }
}

class ReachabilityRule implements LintRule {
  id = 'reachability';

  run(graph: Graph): Diagnostic[] {
    const start = Array.from(graph.nodes.values()).find(isStartNode);
    if (!start) return [];

    const reachable = new Set<string>();
    const queue: string[] = [start.id];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of graph.edges) {
        if (edge.from === current && !reachable.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    return Array.from(graph.nodes.values())
      .filter(node => !reachable.has(node.id))
      .map(node => ({
        level: 'error',
        code: 'NODE_UNREACHABLE',
        message: 'Node is unreachable from start.',
        nodeId: node.id,
      }));
  }
}

class ConditionSyntaxRule implements LintRule {
  id = 'condition_syntax';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const edge of graph.edges) {
      if (edge.condition && !isConditionSyntaxValid(edge.condition)) {
        diagnostics.push({
          level: 'error',
          code: 'CONDITION_INVALID',
          message: `Invalid condition syntax: "${edge.condition}"`,
          edge: { from: edge.from, to: edge.to },
        });
      }
    }
    return diagnostics;
  }
}

class StylesheetSyntaxRule implements LintRule {
  id = 'stylesheet_syntax';

  run(graph: Graph): Diagnostic[] {
    if (!graph.model_stylesheet) return [];
    try {
      parseModelStylesheet(graph.model_stylesheet);
      return [];
    } catch (error) {
      const message = error instanceof StylesheetError ? error.message : 'Invalid model stylesheet';
      return [
        {
          level: 'error',
          code: 'STYLESHEET_INVALID',
          message,
        },
      ];
    }
  }
}

class StylesheetSelectorRule implements LintRule {
  id = 'stylesheet_selector';

  run(graph: Graph): Diagnostic[] {
    if (!graph.model_stylesheet) return [];
    let rules;
    try {
      rules = parseModelStylesheet(graph.model_stylesheet);
    } catch {
      return [];
    }

    const diagnostics: Diagnostic[] = [];
    const nodes = Array.from(graph.nodes.values());

    for (const rule of rules) {
      for (const selector of rule.selectors) {
        const matched = nodes.some(node => selectorMatchesNode(selector, node));
        if (!matched) {
          diagnostics.push({
            level: 'warning',
            code: 'STYLESHEET_SELECTOR_MISSING',
            message: `Stylesheet selector "${selectorToString(selector)}" does not match any node.`,
          });
        }
      }
    }

    return diagnostics;
  }
}

function selectorMatchesNode(
  selector: { type: 'all' | 'class' | 'id' | 'shape'; value: string },
  node: Node
): boolean {
  if (selector.type === 'all') {
    return true;
  }
  if (selector.type === 'id') {
    return node.id === selector.value;
  }
  if (selector.type === 'class') {
    const classes = (node.class || '')
      .split(/[,\s]+/)
      .map(entry => entry.trim())
      .filter(Boolean);
    return classes.includes(selector.value);
  }
  return node.shape === selector.value || node.type === selector.value;
}

function selectorToString(selector: { type: 'all' | 'class' | 'id' | 'shape'; value: string }): string {
  if (selector.type === 'all') {
    return '*';
  }
  if (selector.type === 'class') {
    return `.${selector.value}`;
  }
  if (selector.type === 'id') {
    return `#${selector.value}`;
  }
  return selector.value;
}

class FidelityValidRule implements LintRule {
  id = 'fidelity_valid';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      if (node.fidelity && !VALID_FIDELITY.has(node.fidelity)) {
        diagnostics.push({
          level: 'warning',
          code: 'FIDELITY_INVALID',
          message: `Unknown fidelity "${node.fidelity}".`,
          nodeId: node.id,
        });
      }
    }
    for (const edge of graph.edges) {
      if (edge.fidelity && !VALID_FIDELITY.has(edge.fidelity)) {
        diagnostics.push({
          level: 'warning',
          code: 'FIDELITY_INVALID',
          message: `Unknown fidelity "${edge.fidelity}".`,
          edge: { from: edge.from, to: edge.to },
        });
      }
    }
    return diagnostics;
  }
}

class RetryTargetExistsRule implements LintRule {
  id = 'retry_target_exists';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      if (node.retry_target && !graph.nodes.has(node.retry_target)) {
        diagnostics.push({
          level: 'warning',
          code: 'RETRY_TARGET_MISSING',
          message: `Retry target "${node.retry_target}" does not exist.`,
          nodeId: node.id,
        });
      }
      if (node.fallback_retry_target && !graph.nodes.has(node.fallback_retry_target)) {
        diagnostics.push({
          level: 'warning',
          code: 'FALLBACK_RETRY_TARGET_MISSING',
          message: `Fallback retry target "${node.fallback_retry_target}" does not exist.`,
          nodeId: node.id,
        });
      }
    }
    return diagnostics;
  }
}

class ReasoningEffortRule implements LintRule {
  id = 'reasoning_effort_valid';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      if (node.reasoning_effort && !['low', 'medium', 'high'].includes(node.reasoning_effort)) {
        diagnostics.push({
          level: 'warning',
          code: 'REASONING_EFFORT_INVALID',
          message: `Invalid reasoning_effort "${node.reasoning_effort}".`,
          nodeId: node.id,
        });
      }
    }
    return diagnostics;
  }
}

class CodergenOutputContractRule implements LintRule {
  id = 'codergen_output_contract';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType !== 'codergen') {
        continue;
      }

      const outputContractRequired = parseBoolean(node.attributes.output_contract_required) ?? false;
      if (!outputContractRequired) {
        continue;
      }

      const hasSchema = hasOutputSchema(node);
      if (!hasSchema) {
        diagnostics.push({
          level: 'error',
          code: 'OUTPUT_SCHEMA_REQUIRED',
          message:
            'Codergen node requires output_schema or output_schema_path when output_contract_required=true.',
          nodeId: node.id,
        });
      }
    }
    return diagnostics;
  }
}

class FanInMergeStrategyRule implements LintRule {
  id = 'fan_in_merge_strategy';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const incomingEdgesByNode = new Map<string, number>();
    for (const edge of graph.edges) {
      incomingEdgesByNode.set(edge.to, (incomingEdgesByNode.get(edge.to) || 0) + 1);
    }

    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType !== 'parallel.fan_in') {
        continue;
      }

      const incomingCount = incomingEdgesByNode.get(node.id) || 0;
      if (incomingCount <= 1) {
        continue;
      }

      const mergeStrategyRaw = asTrimmedLowerString(node.attributes.merge_strategy);
      if (!mergeStrategyRaw) {
        diagnostics.push({
          level: 'error',
          code: 'FAN_IN_MERGE_STRATEGY_REQUIRED',
          message: 'parallel.fan_in nodes with multiple inputs must declare merge_strategy.',
          nodeId: node.id,
        });
        continue;
      }

      if (!['best_score', 'consensus', 'arbiter'].includes(mergeStrategyRaw)) {
        diagnostics.push({
          level: 'error',
          code: 'FAN_IN_MERGE_STRATEGY_INVALID',
          message: `Invalid merge_strategy "${mergeStrategyRaw}". Expected best_score, consensus, or arbiter.`,
          nodeId: node.id,
        });
      }

      const mergeTiebreakRaw = asTrimmedLowerString(node.attributes.merge_tiebreak);
      if (mergeTiebreakRaw && !['weight', 'lexical', 'latest'].includes(mergeTiebreakRaw)) {
        diagnostics.push({
          level: 'error',
          code: 'FAN_IN_MERGE_TIEBREAK_INVALID',
          message: `Invalid merge_tiebreak "${mergeTiebreakRaw}". Expected weight, lexical, or latest.`,
          nodeId: node.id,
        });
      }

      if (mergeStrategyRaw === 'arbiter' && !asTrimmedString(node.attributes.arbiter_prompt)) {
        diagnostics.push({
          level: 'error',
          code: 'FAN_IN_ARBITER_PROMPT_REQUIRED',
          message: 'parallel.fan_in with merge_strategy=arbiter must declare arbiter_prompt.',
          nodeId: node.id,
        });
      }
    }

    return diagnostics;
  }
}

class QualityGateRoutingRule implements LintRule {
  id = 'quality_gate_routing';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType !== 'quality.gate') {
        continue;
      }

      const gateType = asTrimmedLowerString(node.attributes.gate_type) ?? 'custom';
      if (!['tests', 'lint', 'typecheck', 'security', 'custom'].includes(gateType)) {
        diagnostics.push({
          level: 'error',
          code: 'QUALITY_GATE_TYPE_INVALID',
          message:
            `Invalid gate_type "${String(node.attributes.gate_type)}". Expected tests, lint, typecheck, security, or custom.`,
          nodeId: node.id,
        });
      }

      const passCondition = asTrimmedString(node.attributes.pass_condition);
      if (!passCondition) {
        diagnostics.push({
          level: 'error',
          code: 'QUALITY_GATE_PASS_CONDITION_REQUIRED',
          message: 'quality.gate nodes must declare pass_condition.',
          nodeId: node.id,
        });
      }

      const failureTarget = asTrimmedString(node.attributes.failure_target);
      if (!failureTarget) {
        diagnostics.push({
          level: 'error',
          code: 'QUALITY_GATE_FAILURE_TARGET_REQUIRED',
          message: 'quality.gate nodes must declare failure_target.',
          nodeId: node.id,
        });
      } else if (!graph.nodes.has(failureTarget)) {
        diagnostics.push({
          level: 'error',
          code: 'QUALITY_GATE_FAILURE_TARGET_MISSING',
          message: `quality.gate failure_target "${failureTarget}" does not exist.`,
          nodeId: node.id,
        });
      }

      const outgoing = graph.edges.filter(edge => edge.from === node.id);
      if (outgoing.length < 2) {
        diagnostics.push({
          level: 'error',
          code: 'QUALITY_GATE_OUTGOING_EDGES_MISSING',
          message: 'quality.gate nodes must have explicit pass and fail outgoing edges.',
          nodeId: node.id,
        });
        continue;
      }

      if (passCondition && !outgoing.some(edge => edge.condition === passCondition)) {
        diagnostics.push({
          level: 'error',
          code: 'QUALITY_GATE_PASS_EDGE_MISSING',
          message: 'quality.gate pass_condition does not match any outgoing edge condition.',
          nodeId: node.id,
        });
      }

      if (failureTarget && !outgoing.some(edge => edge.to === failureTarget)) {
        diagnostics.push({
          level: 'error',
          code: 'QUALITY_GATE_FAIL_EDGE_MISSING',
          message: 'quality.gate failure_target is not referenced by any outgoing edge.',
          nodeId: node.id,
        });
      }
    }
    return diagnostics;
  }
}

class ConfidenceEscalationRule implements LintRule {
  id = 'confidence_escalation';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType !== 'confidence.gate') {
        continue;
      }

      const signalPath = asTrimmedString(node.attributes.confidence_signal_path);
      if (!signalPath) {
        diagnostics.push({
          level: 'error',
          code: 'CONFIDENCE_SIGNAL_PATH_REQUIRED',
          message: 'confidence.gate nodes must declare confidence_signal_path.',
          nodeId: node.id,
        });
      }

      const threshold = asFiniteNumberLike(node.attributes.escalation_threshold);
      if (threshold === undefined) {
        diagnostics.push({
          level: 'error',
          code: 'ESCALATION_THRESHOLD_REQUIRED',
          message: 'confidence.gate nodes must declare numeric escalation_threshold.',
          nodeId: node.id,
        });
      } else if (threshold < 0 || threshold > 1) {
        diagnostics.push({
          level: 'error',
          code: 'ESCALATION_THRESHOLD_INVALID',
          message: 'confidence.gate escalation_threshold must be in range [0,1].',
          nodeId: node.id,
        });
      }

      const outgoing = graph.edges.filter(edge => edge.from === node.id);
      if (outgoing.length < 2) {
        diagnostics.push({
          level: 'error',
          code: 'CONFIDENCE_GATE_OUTGOING_EDGES_MISSING',
          message: 'confidence.gate nodes must have autonomous and escalation outgoing edges.',
          nodeId: node.id,
        });
      }

      const escalationTarget = asTrimmedString(node.attributes.escalation_target);
      const waitHumanOutgoing = outgoing.filter(edge => {
        const target = graph.nodes.get(edge.to);
        return Boolean(target) && isWaitHumanNode(target as Node);
      });

      if (escalationTarget) {
        const targetNode = graph.nodes.get(escalationTarget);
        if (!targetNode) {
          diagnostics.push({
            level: 'error',
            code: 'CONFIDENCE_ESCALATION_TARGET_UNKNOWN',
            message: `confidence.gate escalation_target "${escalationTarget}" does not exist.`,
            nodeId: node.id,
          });
        } else if (!isWaitHumanNode(targetNode)) {
          diagnostics.push({
            level: 'error',
            code: 'CONFIDENCE_ESCALATION_TARGET_NOT_HUMAN',
            message: 'confidence.gate escalation_target must point to a wait.human node.',
            nodeId: node.id,
          });
        } else if (!outgoing.some(edge => edge.to === escalationTarget)) {
          diagnostics.push({
            level: 'error',
            code: 'CONFIDENCE_ESCALATION_EDGE_MISSING',
            message: 'confidence.gate escalation_target is not referenced by an outgoing edge.',
            nodeId: node.id,
          });
        }
      } else {
        if (waitHumanOutgoing.length === 0) {
          diagnostics.push({
            level: 'error',
            code: 'CONFIDENCE_ESCALATION_TARGET_MISSING',
            message: 'confidence.gate requires one wait.human outgoing edge or escalation_target.',
            nodeId: node.id,
          });
        } else if (waitHumanOutgoing.length > 1) {
          diagnostics.push({
            level: 'error',
            code: 'CONFIDENCE_ESCALATION_TARGET_AMBIGUOUS',
            message: 'confidence.gate has multiple wait.human outgoing edges; set escalation_target.',
            nodeId: node.id,
          });
        }
      }

      const autonomousOutgoing = outgoing.filter(edge => {
        const target = graph.nodes.get(edge.to);
        return Boolean(target) && !isWaitHumanNode(target as Node);
      });
      if (autonomousOutgoing.length === 0) {
        diagnostics.push({
          level: 'error',
          code: 'CONFIDENCE_AUTONOMOUS_EDGE_MISSING',
          message: 'confidence.gate requires at least one autonomous (non-wait.human) outgoing edge.',
          nodeId: node.id,
        });
      }
    }
    return diagnostics;
  }
}

class ManagerLoopContractRule implements LintRule {
  id = 'manager_loop_contract';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const validActions = new Set(['delegate', 'observe', 'steer', 'wait']);

    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType !== 'stack.manager_loop') {
        continue;
      }

      const childDotfile = asTrimmedString(node.attributes.stack_child_dotfile);
      if (!childDotfile) {
        diagnostics.push({
          level: 'error',
          code: 'MANAGER_CHILD_DOTFILE_REQUIRED',
          message: 'stack.manager_loop nodes must declare stack_child_dotfile.',
          nodeId: node.id,
        });
      }

      const pollInterval = node.attributes.manager_poll_interval;
      if (pollInterval !== undefined && pollInterval !== null) {
        const parsed = asFiniteNumberLike(pollInterval);
        if (parsed === undefined || parsed < 0 || !Number.isInteger(parsed)) {
          diagnostics.push({
            level: 'error',
            code: 'MANAGER_POLL_INTERVAL_INVALID',
            message: 'manager_poll_interval must be an integer >= 0.',
            nodeId: node.id,
          });
        }
      }

      const maxCycles = node.attributes.manager_max_cycles;
      if (maxCycles !== undefined && maxCycles !== null) {
        const parsed = asFiniteNumberLike(maxCycles);
        if (parsed === undefined || parsed < 1 || !Number.isInteger(parsed)) {
          diagnostics.push({
            level: 'error',
            code: 'MANAGER_MAX_CYCLES_INVALID',
            message: 'manager_max_cycles must be an integer >= 1.',
            nodeId: node.id,
          });
        }
      }

      const actionsRaw = node.attributes.manager_actions;
      if (actionsRaw !== undefined && actionsRaw !== null) {
        const actionValues: string[] = [];
        if (typeof actionsRaw === 'string') {
          actionValues.push(...actionsRaw.split(','));
        } else if (Array.isArray(actionsRaw)) {
          for (const action of actionsRaw) {
            if (typeof action === 'string') {
              actionValues.push(action);
            }
          }
        } else {
          diagnostics.push({
            level: 'error',
            code: 'MANAGER_ACTION_INVALID',
            message:
              'manager_actions must be a comma-delimited string or string array containing delegate, observe, steer, wait.',
            nodeId: node.id,
          });
        }

        for (const action of actionValues) {
          const normalized = action.trim().toLowerCase();
          if (!normalized || !validActions.has(normalized)) {
            diagnostics.push({
              level: 'error',
              code: 'MANAGER_ACTION_INVALID',
              message:
                'manager_actions contains an invalid action. Expected delegate, observe, steer, wait.',
              nodeId: node.id,
            });
            break;
          }
        }
      }

      const stopCondition = asTrimmedString(node.attributes.manager_stop_condition);
      if (stopCondition && !isConditionSyntaxValid(stopCondition)) {
        diagnostics.push({
          level: 'error',
          code: 'MANAGER_STOP_CONDITION_INVALID',
          message: `Invalid manager_stop_condition syntax: "${stopCondition}"`,
          nodeId: node.id,
        });
      }

      const requireLockRaw = node.attributes.manager_require_lock;
      const requireLock = parseBoolean(requireLockRaw);
      if (
        requireLockRaw !== undefined &&
        requireLockRaw !== null &&
        requireLock === undefined
      ) {
        diagnostics.push({
          level: 'error',
          code: 'MANAGER_REQUIRE_LOCK_INVALID',
          message: 'manager_require_lock must be a boolean-like value (true/false).',
          nodeId: node.id,
        });
      }

      if (requireLock === true && typeof node.attributes.manager_child_lock_key === 'string') {
        const lockKey = node.attributes.manager_child_lock_key.trim();
        if (!lockKey) {
          diagnostics.push({
            level: 'error',
            code: 'MANAGER_CHILD_LOCK_KEY_REQUIRED',
            message: 'manager_child_lock_key must be non-empty when manager_require_lock=true.',
            nodeId: node.id,
          });
        }
      }
    }

    return diagnostics;
  }
}

class JudgeRubricRule implements LintRule {
  id = 'judge_rubric_config';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType !== 'judge.rubric') {
        continue;
      }

      const rubricPath = asTrimmedString(node.attributes.judge_rubric_path);
      if (!rubricPath) {
        diagnostics.push({
          level: 'error',
          code: 'JUDGE_RUBRIC_PATH_REQUIRED',
          message: 'judge.rubric nodes must declare judge_rubric_path.',
          nodeId: node.id,
        });
      }

      const scoreThreshold = asFiniteNumberLike(node.attributes.score_threshold);
      if (scoreThreshold === undefined) {
        diagnostics.push({
          level: 'error',
          code: 'JUDGE_SCORE_THRESHOLD_REQUIRED',
          message: 'judge.rubric nodes must declare numeric score_threshold.',
          nodeId: node.id,
        });
      }

      const scoreWeights = node.attributes.score_weights;
      if (scoreWeights !== undefined && scoreWeights !== null) {
        const parsedWeights = parseJsonObject(scoreWeights);
        if (!parsedWeights) {
          diagnostics.push({
            level: 'error',
            code: 'JUDGE_SCORE_WEIGHTS_INVALID',
            message: 'judge.rubric score_weights must be a JSON object.',
            nodeId: node.id,
          });
        }
      }
    }
    return diagnostics;
  }
}

class TargetedRetryRule implements LintRule {
  id = 'targeted_retry_config';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      const retryPolicy = asTrimmedLowerString(node.attributes.retry_policy);
      if (!retryPolicy) {
        continue;
      }
      if (!['none', 'standard', 'targeted'].includes(retryPolicy)) {
        diagnostics.push({
          level: 'error',
          code: 'RETRY_POLICY_INVALID',
          message: `Invalid retry_policy "${retryPolicy}". Expected none, standard, or targeted.`,
          nodeId: node.id,
        });
        continue;
      }
      if (retryPolicy !== 'targeted') {
        continue;
      }

      const schemaValue = node.attributes.retry_classifier_schema;
      if (schemaValue !== undefined && schemaValue !== null && !parseJsonObject(schemaValue)) {
        diagnostics.push({
          level: 'error',
          code: 'RETRY_CLASSIFIER_SCHEMA_INVALID',
          message: 'retry_classifier_schema must be a JSON object when provided.',
          nodeId: node.id,
        });
      }

      const retryTargets = collectTargetedRetryTargets(node);
      if (Object.keys(retryTargets).length === 0) {
        diagnostics.push({
          level: 'error',
          code: 'TARGETED_RETRY_TARGETS_MISSING',
          message:
            'retry_policy=targeted requires retry_target_map or class-specific retry_target_* attributes.',
          nodeId: node.id,
        });
      }

      for (const [failureClass, target] of Object.entries(retryTargets)) {
        if (!graph.nodes.has(target)) {
          diagnostics.push({
            level: 'error',
            code: 'TARGETED_RETRY_TARGET_MISSING',
            message: `retry target for "${failureClass}" points to missing node "${target}".`,
            nodeId: node.id,
          });
        }
      }
    }
    return diagnostics;
  }
}

class BudgetLimitRule implements LintRule {
  id = 'budget_limit_config';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    validatePositiveNumberLike(
      diagnostics,
      graph.attributes.budget_max_tokens,
      'GRAPH_BUDGET_MAX_TOKENS_INVALID',
      'graph budget_max_tokens must be a positive number.'
    );
    validatePositiveNumberLike(
      diagnostics,
      graph.attributes.budget_max_cost_usd,
      'GRAPH_BUDGET_MAX_COST_USD_INVALID',
      'graph budget_max_cost_usd must be a positive number.'
    );
    validatePositiveNumberLike(
      diagnostics,
      graph.attributes.budget_max_duration_ms,
      'GRAPH_BUDGET_MAX_DURATION_MS_INVALID',
      'graph budget_max_duration_ms must be a positive number.'
    );

    for (const node of graph.nodes.values()) {
      validatePositiveNumberLike(
        diagnostics,
        node.attributes.budget_max_tokens,
        'NODE_BUDGET_MAX_TOKENS_INVALID',
        'node budget_max_tokens must be a positive number.',
        node.id
      );
      validatePositiveNumberLike(
        diagnostics,
        node.attributes.budget_max_cost_usd,
        'NODE_BUDGET_MAX_COST_USD_INVALID',
        'node budget_max_cost_usd must be a positive number.',
        node.id
      );
      const timeoutValue = node.attributes.timeout ?? node.timeout;
      validatePositiveNumberLike(
        diagnostics,
        timeoutValue,
        'NODE_TIMEOUT_INVALID',
        'node timeout must be a positive number.',
        node.id
      );
    }
    return diagnostics;
  }
}

class PromotionProfileRule implements LintRule {
  id = 'promotion_profile';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const rawStage = asTrimmedLowerString(graph.attributes.promotion_stage) ?? 'dev';
    const rawProfile = asTrimmedLowerString(graph.attributes.quality_profile) ?? 'baseline';
    const validStages: Record<string, number> = {
      dev: 0,
      canary: 1,
      prod: 2,
    };
    const validProfiles: Record<string, number> = {
      baseline: 0,
      strict: 1,
      regulated: 2,
    };

    if (!(rawStage in validStages)) {
      diagnostics.push({
        level: 'error',
        code: 'PROMOTION_STAGE_INVALID',
        message: `Invalid promotion_stage "${rawStage}". Expected dev, canary, or prod.`,
      });
      return diagnostics;
    }
    if (!(rawProfile in validProfiles)) {
      diagnostics.push({
        level: 'error',
        code: 'QUALITY_PROFILE_INVALID',
        message: `Invalid quality_profile "${rawProfile}". Expected baseline, strict, or regulated.`,
      });
      return diagnostics;
    }

    const stageLevel = validStages[rawStage];
    const profileLevel = validProfiles[rawProfile];
    if (profileLevel < stageLevel) {
      diagnostics.push({
        level: 'error',
        code: 'QUALITY_PROFILE_TOO_WEAK_FOR_STAGE',
        message: `quality_profile "${rawProfile}" is weaker than promotion_stage "${rawStage}" requirements.`,
      });
    }

    const effectiveLevel = Math.max(stageLevel, profileLevel);
    if (effectiveLevel >= 1) {
      const strictDiagnostics = this.validateStrictOverlay(graph);
      diagnostics.push(...strictDiagnostics);
    }
    if (effectiveLevel >= 2) {
      const regulatedDiagnostics = this.validateRegulatedOverlay(graph);
      diagnostics.push(...regulatedDiagnostics);
    }
    return diagnostics;
  }

  private validateStrictOverlay(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const qualityGateNodes = Array.from(graph.nodes.values()).filter(node => {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      return effectiveType === 'quality.gate';
    });
    if (qualityGateNodes.length === 0) {
      diagnostics.push({
        level: 'error',
        code: 'STRICT_QUALITY_GATE_REQUIRED',
        message: 'Strict quality profiles require at least one quality.gate node.',
      });
    }

    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType !== 'codergen') {
        continue;
      }

      const contractRequired = parseBoolean(node.attributes.output_contract_required) ?? false;
      if (!contractRequired) {
        diagnostics.push({
          level: 'error',
          code: 'STRICT_CODEGEN_CONTRACT_REQUIRED',
          message:
            'Strict quality profiles require codergen nodes to set output_contract_required=true.',
          nodeId: node.id,
        });
      }
    }
    return diagnostics;
  }

  private validateRegulatedOverlay(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    let hasJudge = false;

    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType === 'judge.rubric') {
        hasJudge = true;
      }
      if (effectiveType !== 'quality.gate') {
        continue;
      }
      const gateType = asTrimmedLowerString(node.attributes.gate_type) ?? 'custom';
      if (gateType === 'custom') {
        diagnostics.push({
          level: 'error',
          code: 'REGULATED_GATE_TYPE_REQUIRED',
          message: 'Regulated quality profiles require non-custom quality.gate types.',
          nodeId: node.id,
        });
      }
    }

    if (!hasJudge) {
      diagnostics.push({
        level: 'error',
        code: 'REGULATED_JUDGE_REQUIRED',
        message: 'Regulated quality profiles require at least one judge.rubric node.',
      });
    }

    return diagnostics;
  }
}

class HandlerConfigRule implements LintRule {
  id = 'handler_config';

  run(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      const effectiveType = node.type || SHAPE_TO_TYPE[node.shape];
      if (effectiveType === 'codergen') {
        if (!node.llm_provider) {
          diagnostics.push({
            level: 'error',
            code: 'LLM_PROVIDER_MISSING',
            message: 'Codergen node missing llm_provider.',
            nodeId: node.id,
          });
        }
        if (!node.llm_model) {
          diagnostics.push({
            level: 'error',
            code: 'LLM_MODEL_MISSING',
            message: 'Codergen node missing llm_model.',
            nodeId: node.id,
          });
        }
      }
    }
    return diagnostics;
  }
}

class TypeKnownRule implements LintRule {
  id = 'type_known';

  run(graph: Graph, context: LintContext): Diagnostic[] {
    if (!context.handlerRegistry) return [];
    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      if (node.type && !context.handlerRegistry.has(node.type)) {
        diagnostics.push({
          level: 'warning',
          code: 'HANDLER_MISSING',
          message: `No handler registered for type "${node.type}".`,
          nodeId: node.id,
        });
      }
    }
    return diagnostics;
  }
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return undefined;
}

function hasOutputSchema(node: Node): boolean {
  const path = node.attributes.output_schema_path;
  if (typeof path === 'string' && path.trim().length > 0) {
    return true;
  }
  const schema = node.attributes.output_schema;
  if (schema === undefined || schema === null) {
    return false;
  }
  if (typeof schema === 'string') {
    return schema.trim().length > 0;
  }
  return typeof schema === 'object';
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asTrimmedLowerString(value: unknown): string | undefined {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function asFiniteNumberLike(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function validatePositiveNumberLike(
  diagnostics: Diagnostic[],
  value: unknown,
  code: string,
  message: string,
  nodeId?: string
): void {
  if (value === undefined || value === null) {
    return;
  }
  const parsed = asFiniteNumberLike(value);
  if (parsed !== undefined && parsed > 0) {
    return;
  }
  diagnostics.push({
    level: 'error',
    code,
    message,
    nodeId,
  });
}

function isWaitHumanNode(node: Node): boolean {
  return node.type === 'wait.human' || node.shape === 'hexagon';
}

function collectTargetedRetryTargets(node: Node): Record<string, string> {
  const targets: Record<string, string> = {};
  const classTargets: Record<string, unknown> = {
    transient: node.attributes.retry_target_transient,
    quality_gap: node.attributes.retry_target_quality_gap,
    tool_error: node.attributes.retry_target_tool_error,
    spec_mismatch: node.attributes.retry_target_spec_mismatch,
  };

  for (const [failureClass, value] of Object.entries(classTargets)) {
    const target = asTrimmedString(value);
    if (target) {
      targets[failureClass] = target;
    }
  }

  const map = parseJsonObject(node.attributes.retry_target_map);
  if (map) {
    for (const key of ['transient', 'quality_gap', 'tool_error', 'spec_mismatch']) {
      const target = asTrimmedString(map[key]);
      if (target) {
        targets[key] = target;
      }
    }
  }

  return targets;
}
