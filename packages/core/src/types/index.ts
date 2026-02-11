/**
 * Core types for the Attractor execution engine
 */

export type StageStatus = 
  | 'SUCCESS' 
  | 'FAIL' 
  | 'PARTIAL_SUCCESS' 
  | 'RETRY' 
  | 'SKIPPED';

export interface Outcome {
  status: StageStatus;
  preferred_label?: string;
  suggested_next_ids?: string[];
  context_updates: Record<string, unknown>;
  notes?: string;
  failure_reason?: string;
}

export interface Node {
  id: string;
  type: string;
  shape: string;
  label: string;
  prompt?: string;
  max_retries: number;
  goal_gate: boolean;
  retry_target?: string;
  fallback_retry_target?: string;
  fidelity?: string;
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

export interface Edge {
  from: string;
  to: string;
  label?: string;
  condition?: string;
  weight: number;
  fidelity?: string;
  thread_id?: string;
  loop_restart?: boolean;
  attributes: Record<string, unknown>;
}

export interface Graph {
  id: string;
  goal?: string;
  label?: string;
  model_stylesheet?: string;
  default_max_retry: number;
  retry_target?: string;
  fallback_retry_target?: string;
  default_fidelity?: string;
  nodes: Map<string, Node>;
  edges: Edge[];
  attributes: Record<string, unknown>;
}

export interface RunConfig {
  logs_root: string;
  checkpoint_interval?: number;
  max_restarts?: number;
  llm_backend?: 'api' | 'cli';
  default_provider?: string;
  llm_provider?: string;
  llm_model?: string;
  providers?: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
  api_key_env?: string;
  default_model?: string;
  base_url?: string;
  package?: string;
}

export interface RetryPolicy {
  max_attempts: number;
  backoff: BackoffConfig;
  should_retry: (error: Error) => boolean;
}

export interface BackoffConfig {
  initial_delay_ms: number;
  backoff_factor: number;
  max_delay_ms: number;
  jitter: boolean;
}

export interface Checkpoint {
  timestamp: Date;
  current_node: string;
  completed_nodes: string[];
  node_retries: Record<string, number>;
  context_values: Record<string, unknown>;
  node_outcomes?: Record<string, Outcome>;
  logs: string[];
}

export interface Handler {
  execute(
    node: Node,
    context: Context,
    graph: Graph,
    logs_root: string,
    signal?: AbortSignal
  ): Promise<Outcome>;
}

// Forward reference - defined in context module
export interface Context {
  set(key: string, value: unknown): Promise<void>;
  get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
  getString(key: string, defaultValue?: string): Promise<string>;
  appendLog(entry: string): Promise<void>;
  snapshot(): Record<string, unknown>;
  clone(): Context;
  apply_updates(updates: Record<string, unknown>): Promise<void>;
}

export interface ExecutionEvent {
  type: 
    | 'RUN_START'
    | 'NODE_START'
    | 'NODE_COMPLETE'
    | 'NODE_RETRY'
    | 'NODE_FAIL'
    | 'EDGE_SELECT'
    | 'CHECKPOINT_SAVE'
    | 'RUN_COMPLETE'
    | 'ERROR';
  timestamp: Date;
  data: unknown;
}

export const SHAPE_TO_TYPE: Record<string, string> = {
  'Mdiamond': 'start',
  'circle': 'start',
  'Msquare': 'exit',
  'doublecircle': 'exit',
  'box': 'codergen',
  'hexagon': 'wait.human',
  'diamond': 'conditional',
  'component': 'parallel',
  'tripleoctagon': 'parallel.fan_in',
  'parallelogram': 'tool',
  'house': 'stack.manager_loop',
};

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initial_delay_ms: 200,
  backoff_factor: 2.0,
  max_delay_ms: 60000,
  jitter: true,
};

export const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  none: {
    max_attempts: 1,
    backoff: DEFAULT_BACKOFF_CONFIG,
    should_retry: () => false,
  },
  standard: {
    max_attempts: 5,
    backoff: DEFAULT_BACKOFF_CONFIG,
    should_retry: (error) => isRetryableError(error),
  },
  aggressive: {
    max_attempts: 5,
    backoff: { ...DEFAULT_BACKOFF_CONFIG, initial_delay_ms: 500 },
    should_retry: (error) => isRetryableError(error),
  },
  linear: {
    max_attempts: 3,
    backoff: { ...DEFAULT_BACKOFF_CONFIG, backoff_factor: 1.0 },
    should_retry: (error) => isRetryableError(error),
  },
  patient: {
    max_attempts: 3,
    backoff: { ...DEFAULT_BACKOFF_CONFIG, initial_delay_ms: 2000, backoff_factor: 3.0 },
    should_retry: (error) => isRetryableError(error),
  },
};

function isRetryableError(error: Error): boolean {
  // Network errors, rate limits (429), server errors (5xx) are retryable
  // Auth errors (401, 403), bad requests (400), validation errors are not
  const message = error.message.toLowerCase();
  
  if (message.includes('429')) return true;
  if (message.includes('5') && message.includes('error')) return true;
  if (message.includes('timeout')) return true;
  if (message.includes('econnreset')) return true;
  if (message.includes('etimedout')) return true;
  
  if (message.includes('401')) return false;
  if (message.includes('403')) return false;
  if (message.includes('400')) return false;
  
  return false;
}
