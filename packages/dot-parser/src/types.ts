/**
 * Type definitions for DOT parser
 */

export interface ParsedNode {
  id: string;
  type: string;
  shape: string;
  label: string;
  prompt?: string;
  max_retries: number;
  goal_gate: boolean;
  retry_target?: string;
  fallback_retry_target?: string;
  fidelity: string;
  thread_id?: string;
  class?: string;
  timeout?: number;
  llm_model?: string;
  llm_provider?: string;
  reasoning_effort: 'low' | 'medium' | 'high';
  auto_status: boolean;
  allow_partial: boolean;
  attributes: Record<string, unknown>;
}

export interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  condition?: string;
  weight: number;
  fidelity: string;
  thread_id?: string;
  loop_restart: boolean;
  attributes: Record<string, unknown>;
}

export interface ParsedGraph {
  id: string;
  type: 'digraph';
  goal?: string;
  label?: string;
  model_stylesheet?: string;
  default_max_retry: number;
  retry_target?: string;
  fallback_retry_target?: string;
  default_fidelity: string;
  nodes: Map<string, ParsedNode>;
  edges: ParsedEdge[];
  attributes: Record<string, unknown>;
}
