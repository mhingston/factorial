// Observability module for Factorial
// Provides agent-legible access to logs, metrics, and traces

export {
  ObservabilityStackManager,
  type ObservabilityStackConfig,
  type StackStatus,
  type StackInfo,
} from './stack-manager.js';

export {
  ObservabilityQueryClient,
  queryLogs,
  queryMetrics,
  queryTraces,
  type LogQueryResult,
  type MetricQueryResult,
  type TraceQueryResult,
  type QueryError,
  type QueryOptions,
} from './query-client.js';
