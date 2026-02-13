import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface QueryOptions {
  worktreeId: string;
  basePath: string;
  timeout?: number;
}

export interface LogQueryResult {
  query: string;
  count: number;
  logs: Array<{
    timestamp: string;
    message: string;
    level?: string;
    [key: string]: unknown;
  }>;
  took_ms: number;
}

export interface MetricQueryResult {
  query: string;
  series: Array<{
    metric: Record<string, string>;
    values: Array<[number, string]>;
  }>;
  count: number;
  took_ms: number;
}

export interface TraceQueryResult {
  query: string;
  traces: Array<{
    trace_id: string;
    span_id: string;
    parent_span_id?: string;
    name: string;
    duration_ms: number;
    start_time: string;
    attributes: Record<string, unknown>;
  }>;
  count: number;
  took_ms: number;
}

export interface QueryError {
  error: string;
  query: string;
  status_code?: number;
}

export class ObservabilityQueryClient {
  private basePath: string;

  constructor(options: { basePath: string }) {
    this.basePath = options.basePath;
  }

  /**
   * Get ports for a worktree's observability stack
   */
  private async getPorts(worktreeId: string): Promise<{ victoriaLogs: number; victoriaMetrics: number; victoriaTraces: number }> {
    const portsPath = join(this.basePath, worktreeId, 'ports.json');

    try {
      const content = await readFile(portsPath, 'utf-8');
      const data = JSON.parse(content);
      return data.ports;
    } catch {
      throw new Error(`Failed to load ports configuration for worktree: ${worktreeId}`);
    }
  }

  /**
   * Query logs using LogQL
   * OBS-003: Deterministic query results with explicit time ranges
   */
  async queryLogs(worktreeId: string, logqlQuery: string, options?: { start?: Date; end?: Date; limit?: number }): Promise<LogQueryResult | QueryError> {
    const startTime = Date.now();

    try {
      const ports = await this.getPorts(worktreeId);
      const baseUrl = `http://localhost:${ports.victoriaLogs}`;

      // Build query parameters
      const params = new URLSearchParams({
        query: logqlQuery,
        limit: String(options?.limit ?? 100),
      });

      if (options?.start) {
        params.set('start', options.start.toISOString());
      }
      if (options?.end) {
        params.set('end', options.end.toISOString());
      }

      const response = await fetch(`${baseUrl}/select/logsql/query?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          error: `Log query failed: ${error}`,
          query: logqlQuery,
          status_code: response.status,
        };
      }

      const data = (await response.json()) as {
        result?: Array<{ _time?: string; _msg?: string; [key: string]: unknown }>;
      };

      return {
        query: logqlQuery,
        count: data.result?.length ?? 0,
        logs: (data.result ?? []).map((log: { _time?: string; _msg?: string; [key: string]: unknown }) => ({
          timestamp: log._time ?? new Date().toISOString(),
          message: log._msg ?? '',
          ...log,
        })),
        took_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        query: logqlQuery,
      };
    }
  }

  /**
   * Query metrics using PromQL
   * OBS-003: Deterministic query results with explicit time ranges
   */
  async queryMetrics(worktreeId: string, promqlQuery: string, options?: { start?: Date; end?: Date; step?: string }): Promise<MetricQueryResult | QueryError> {
    const startTime = Date.now();

    try {
      const ports = await this.getPorts(worktreeId);
      const baseUrl = `http://localhost:${ports.victoriaMetrics}`;

      // Build query parameters
      const params = new URLSearchParams({
        query: promqlQuery,
      });

      if (options?.start && options?.end) {
        params.set('start', Math.floor(options.start.getTime() / 1000).toString());
        params.set('end', Math.floor(options.end.getTime() / 1000).toString());
        params.set('step', options.step ?? '60');

        const response = await fetch(`${baseUrl}/api/v1/query_range?${params.toString()}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          const error = await response.text();
          return {
            error: `Metric range query failed: ${error}`,
            query: promqlQuery,
            status_code: response.status,
          };
        }

        const data = (await response.json()) as {
          status: string;
          error?: string;
          data?: {
            result?: Array<{
              metric: Record<string, string>;
              values: Array<[number, string]>;
            }>;
          };
        };

        if (data.status !== 'success') {
          return {
            error: `Metric query error: ${data.error ?? 'Unknown error'}`,
            query: promqlQuery,
          };
        }

        return {
          query: promqlQuery,
          series: data.data?.result ?? [],
          count: data.data?.result?.length ?? 0,
          took_ms: Date.now() - startTime,
        };
      } else {
        // Instant query
        const response = await fetch(`${baseUrl}/api/v1/query?${params.toString()}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          const error = await response.text();
          return {
            error: `Metric query failed: ${error}`,
            query: promqlQuery,
            status_code: response.status,
          };
        }

        const data = (await response.json()) as {
          status: string;
          error?: string;
          data?: {
            result?: Array<{
              metric: Record<string, string>;
              values: Array<[number, string]>;
            }>;
          };
        };

        if (data.status !== 'success') {
          return {
            error: `Metric query error: ${data.error ?? 'Unknown error'}`,
            query: promqlQuery,
          };
        }

        return {
          query: promqlQuery,
          series: data.data?.result ?? [],
          count: data.data?.result?.length ?? 0,
          took_ms: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        query: promqlQuery,
      };
    }
  }

  /**
   * Query traces using TraceQL
   * OBS-003: Deterministic query results with explicit time ranges
   */
  async queryTraces(worktreeId: string, traceqlQuery: string, options?: { start?: Date; end?: Date; limit?: number }): Promise<TraceQueryResult | QueryError> {
    const startTime = Date.now();

    try {
      const ports = await this.getPorts(worktreeId);
      const baseUrl = `http://localhost:${ports.victoriaTraces}`;

      // Build query parameters
      const params = new URLSearchParams({
        query: traceqlQuery,
        limit: String(options?.limit ?? 100),
      });

      if (options?.start) {
        params.set('start', options.start.toISOString());
      }
      if (options?.end) {
        params.set('end', options.end.toISOString());
      }

      const response = await fetch(`${baseUrl}/select/logsql/query?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          error: `Trace query failed: ${error}`,
          query: traceqlQuery,
          status_code: response.status,
        };
      }

      const data = (await response.json()) as {
        result?: Array<{
          trace_id?: string;
          span_id?: string;
          parent_span_id?: string;
          name?: string;
          duration_ms?: number;
          start_time?: string;
          [key: string]: unknown;
        }>;
      };

      // Transform trace data
      const traces = (data.result ?? []).map((trace) => ({
        trace_id: trace.trace_id ?? 'unknown',
        span_id: trace.span_id ?? 'unknown',
        parent_span_id: trace.parent_span_id,
        name: trace.name ?? 'unknown',
        duration_ms: trace.duration_ms ?? 0,
        start_time: trace.start_time ?? new Date().toISOString(),
        attributes: trace,
      }));

      return {
        query: traceqlQuery,
        traces,
        count: traces.length,
        took_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        query: traceqlQuery,
      };
    }
  }

  /**
   * Check if query interface is available
   * OBS-006: Graceful degradation when stack unavailable
   */
  async isAvailable(worktreeId: string): Promise<boolean> {
    try {
      const ports = await this.getPorts(worktreeId);

      // Quick health check on Victoria Logs
      const response = await fetch(`http://localhost:${ports.victoriaLogs}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get service health status
   */
  async getHealth(worktreeId: string): Promise<{
    victoriaLogs: boolean;
    victoriaMetrics: boolean;
    victoriaTraces: boolean;
    allHealthy: boolean;
  }> {
    try {
      const ports = await this.getPorts(worktreeId);

      const [logsHealth, metricsHealth, tracesHealth] = await Promise.all([
        this.checkHealth(`http://localhost:${ports.victoriaLogs}/health`),
        this.checkHealth(`http://localhost:${ports.victoriaMetrics}/health`),
        this.checkHealth(`http://localhost:${ports.victoriaTraces}/health`),
      ]);

      return {
        victoriaLogs: logsHealth,
        victoriaMetrics: metricsHealth,
        victoriaTraces: tracesHealth,
        allHealthy: logsHealth && metricsHealth && tracesHealth,
      };
    } catch {
      return {
        victoriaLogs: false,
        victoriaMetrics: false,
        victoriaTraces: false,
        allHealthy: false,
      };
    }
  }

  private async checkHealth(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience functions for direct use
 */
export async function queryLogs(
  worktreeId: string,
  logqlQuery: string,
  options?: { basePath?: string; start?: Date; end?: Date; limit?: number }
): Promise<LogQueryResult | QueryError> {
  const basePath = options?.basePath ?? process.cwd();
  const client = new ObservabilityQueryClient({ basePath });
  return client.queryLogs(worktreeId, logqlQuery, options);
}

export async function queryMetrics(
  worktreeId: string,
  promqlQuery: string,
  options?: { basePath?: string; start?: Date; end?: Date; step?: string }
): Promise<MetricQueryResult | QueryError> {
  const basePath = options?.basePath ?? process.cwd();
  const client = new ObservabilityQueryClient({ basePath });
  return client.queryMetrics(worktreeId, promqlQuery, options);
}

export async function queryTraces(
  worktreeId: string,
  traceqlQuery: string,
  options?: { basePath?: string; start?: Date; end?: Date; limit?: number }
): Promise<TraceQueryResult | QueryError> {
  const basePath = options?.basePath ?? process.cwd();
  const client = new ObservabilityQueryClient({ basePath });
  return client.queryTraces(worktreeId, traceqlQuery, options);
}
