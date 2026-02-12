import { z } from 'zod';
import { CircuitBreakerRegistry, globalCircuitBreakerRegistry } from './circuit-breaker.js';
import type { TwinError } from './contracts.js';

export const externalSystemOperationSchema = z.object({
  operation_id: z.string().min(1),
  system_id: z.string().min(1),
  operation_type: z.enum(['create', 'update', 'delete', 'query', 'execute']),
  idempotency_key: z.string().min(1),
  input: z.unknown(),
  rollback_data: z.unknown().optional(),
});

export type ExternalSystemOperation = z.infer<typeof externalSystemOperationSchema>;

export const externalSystemResultSchema = z.object({
  operation_id: z.string().min(1),
  system_id: z.string().min(1),
  status: z.enum(['success', 'failure', 'degraded', 'timeout', 'circuit_open']),
  output: z.unknown().optional(),
  error: z.custom<TwinError>().optional(),
  rollback_available: z.boolean(),
  rollback_performed: z.boolean(),
  execution_time_ms: z.number().int().nonnegative(),
  timestamp_ms: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).default({}),
});

export type ExternalSystemResult = z.infer<typeof externalSystemResultSchema>;

export interface ExternalSystemAdapter {
  readonly system_id: string;
  execute(operation: ExternalSystemOperation): Promise<ExternalSystemResult>;
  rollback?(operation: ExternalSystemOperation, previousResult: ExternalSystemResult): Promise<ExternalSystemResult>;
}

export interface ExternalSystemAuditLog {
  log_id: string;
  timestamp_ms: number;
  operation: ExternalSystemOperation;
  result: ExternalSystemResult;
  rollback_operation_id?: string;
}

export class ExternalSystemManager {
  private adapters = new Map<string, ExternalSystemAdapter>();
  private auditLog: ExternalSystemAuditLog[] = [];
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private readonly maxAuditLogSize: number;

  constructor(
    circuitBreakerRegistry: CircuitBreakerRegistry = globalCircuitBreakerRegistry,
    maxAuditLogSize?: number
  ) {
    this.circuitBreakerRegistry = circuitBreakerRegistry;
    // Allow configuration via environment variable, with sensible defaults
    const envMaxSize = process.env.EXTERNAL_SYSTEM_AUDIT_LOG_MAX_SIZE
      ? parseInt(process.env.EXTERNAL_SYSTEM_AUDIT_LOG_MAX_SIZE, 10)
      : undefined;
    this.maxAuditLogSize = maxAuditLogSize ?? envMaxSize ?? 10000;
  }

  registerAdapter(adapter: ExternalSystemAdapter): void {
    this.adapters.set(adapter.system_id, adapter);
  }

  getAdapter(systemId: string): ExternalSystemAdapter | undefined {
    return this.adapters.get(systemId);
  }

  async execute(operation: ExternalSystemOperation): Promise<ExternalSystemResult> {
    const adapter = this.adapters.get(operation.system_id);
    if (!adapter) {
      const result: ExternalSystemResult = {
        operation_id: operation.operation_id,
        system_id: operation.system_id,
        status: 'failure',
        error: {
          code: 'twin_not_found',
          class: 'spec_mismatch',
          message: `No adapter registered for system: ${operation.system_id}`,
          retryable: false,
          details: {},
        },
        rollback_available: false,
        rollback_performed: false,
        execution_time_ms: 0,
        timestamp_ms: Date.now(),
        metadata: {},
      };
      this.addAuditLog(operation, result);
      return result;
    }

    const circuitBreaker = this.circuitBreakerRegistry.getOrCreate(
      `external-system:${operation.system_id}`,
      {
        failure_threshold: 5,
        success_threshold: 3,
        timeout_ms: 30000,
        half_open_max_calls: 3,
      }
    );

    const startTime = Date.now();

    try {
      const result = await circuitBreaker.execute(
        () => adapter.execute(operation),
        { operation_id: operation.operation_id, operation_type: operation.operation_type }
      );

      this.addAuditLog(operation, result);
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof Error && error.name === 'CircuitBreakerOpenError') {
        const result: ExternalSystemResult = {
          operation_id: operation.operation_id,
          system_id: operation.system_id,
          status: 'circuit_open',
          error: {
            code: 'partial_outage',
            class: 'transient',
            message: `Circuit breaker open for system: ${operation.system_id}`,
            retryable: true,
            details: { circuit_breaker_error: error.message },
          },
          rollback_available: false,
          rollback_performed: false,
          execution_time_ms: executionTime,
          timestamp_ms: Date.now(),
          metadata: {},
        };
        this.addAuditLog(operation, result);
        return result;
      }

      const result: ExternalSystemResult = {
        operation_id: operation.operation_id,
        system_id: operation.system_id,
        status: 'failure',
        error: {
          code: 'internal_error',
          class: 'transient',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          details: {},
        },
        rollback_available: false,
        rollback_performed: false,
        execution_time_ms: executionTime,
        timestamp_ms: Date.now(),
        metadata: {},
      };
      this.addAuditLog(operation, result);
      return result;
    }
  }

  async executeWithRollbackOnFailure(
    operation: ExternalSystemOperation
  ): Promise<ExternalSystemResult> {
    const result = await this.execute(operation);

    if (result.status === 'failure' && result.rollback_available) {
      return this.rollback(operation, result);
    }

    return result;
  }

  async rollback(
    operation: ExternalSystemOperation,
    previousResult: ExternalSystemResult
  ): Promise<ExternalSystemResult> {
    const adapter = this.adapters.get(operation.system_id);
    if (!adapter || !adapter.rollback) {
      return {
        ...previousResult,
        rollback_performed: false,
      };
    }

    try {
      const rollbackResult = await adapter.rollback(operation, previousResult);
      this.addAuditLog(operation, rollbackResult, operation.operation_id);
      return rollbackResult;
    } catch (error) {
      const rollbackFailureResult: ExternalSystemResult = {
        operation_id: `${operation.operation_id}-rollback`,
        system_id: operation.system_id,
        status: 'failure',
        error: {
          code: 'internal_error',
          class: 'transient',
          message: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false,
          details: {},
        },
        rollback_available: false,
        rollback_performed: false,
        execution_time_ms: 0,
        timestamp_ms: Date.now(),
        metadata: {},
      };
      this.addAuditLog(operation, rollbackFailureResult, operation.operation_id);
      return rollbackFailureResult;
    }
  }

  private addAuditLog(
    operation: ExternalSystemOperation,
    result: ExternalSystemResult,
    rollbackOperationId?: string
  ): void {
    const log: ExternalSystemAuditLog = {
      log_id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp_ms: Date.now(),
      operation,
      result,
      rollback_operation_id: rollbackOperationId,
    };

    this.auditLog.push(log);

    // Prune old logs if exceeding max size
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
    }
  }

  getAuditLog(): ExternalSystemAuditLog[] {
    return [...this.auditLog];
  }

  getAuditLogSize(): number {
    return this.auditLog.length;
  }

  getMaxAuditLogSize(): number {
    return this.maxAuditLogSize;
  }

  getAuditLogForOperation(operationId: string): ExternalSystemAuditLog[] {
    return this.auditLog.filter(log => log.operation.operation_id === operationId);
  }

  clearAuditLog(): void {
    this.auditLog = [];
  }

  getCircuitBreakerMetrics(systemId: string) {
    const breaker = this.circuitBreakerRegistry.get(`external-system:${systemId}`);
    return breaker?.getMetrics();
  }

  getAllCircuitBreakerMetrics() {
    return this.circuitBreakerRegistry.getAll().map(b => ({
      system_id: b.getName().replace('external-system:', ''),
      metrics: b.getMetrics(),
    }));
  }
}

// Default manager instance
export const defaultExternalSystemManager = new ExternalSystemManager();

// Schema for external system operations report
export const externalSystemOperationsReportSchema = z.object({
  schema_version: z.literal('external_system_operations_report.v1'),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_operations: z.number().int().nonnegative(),
    successful: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    circuit_open: z.number().int().nonnegative(),
    rollbacks_performed: z.number().int().nonnegative(),
  }),
  systems: z.array(z.object({
    system_id: z.string(),
    total_operations: z.number().int().nonnegative(),
    successful: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    circuit_breaker_state: z.enum(['closed', 'open', 'half_open']),
    circuit_breaker_metrics: z.record(z.unknown()),
  })),
  audit_trail_sample: z.array(z.object({
    log_id: z.string(),
    timestamp_ms: z.number(),
    operation_id: z.string(),
    system_id: z.string(),
    status: z.string(),
    rollback_performed: z.boolean(),
  })),
});

export type ExternalSystemOperationsReport = z.infer<typeof externalSystemOperationsReportSchema>;

export function generateExternalSystemOperationsReport(
  manager: ExternalSystemManager
): ExternalSystemOperationsReport {
  const auditLog = manager.getAuditLog();
  const systems = new Map<string, typeof report.systems[0]>();

  for (const log of auditLog) {
    const systemId = log.operation.system_id;
    if (!systems.has(systemId)) {
      const metrics = manager.getCircuitBreakerMetrics(systemId);
      systems.set(systemId, {
        system_id: systemId,
        total_operations: 0,
        successful: 0,
        failed: 0,
        degraded: 0,
        circuit_breaker_state: metrics?.state ?? 'closed',
        circuit_breaker_metrics: (metrics ?? {}) as Record<string, unknown>,
      });
    }

    const system = systems.get(systemId)!;
    system.total_operations++;

    if (log.result.status === 'success') {
      system.successful++;
    } else if (log.result.status === 'failure') {
      system.failed++;
    } else if (log.result.status === 'degraded') {
      system.degraded++;
    }
  }

  const summary = {
    total_operations: auditLog.length,
    successful: auditLog.filter(l => l.result.status === 'success').length,
    failed: auditLog.filter(l => l.result.status === 'failure').length,
    degraded: auditLog.filter(l => l.result.status === 'degraded').length,
    circuit_open: auditLog.filter(l => l.result.status === 'circuit_open').length,
    rollbacks_performed: auditLog.filter(l => l.result.rollback_performed).length,
  };

  const report: ExternalSystemOperationsReport = {
    schema_version: 'external_system_operations_report.v1',
    generated_at: new Date().toISOString(),
    summary,
    systems: Array.from(systems.values()),
    audit_trail_sample: auditLog.slice(-10).map(log => ({
      log_id: log.log_id,
      timestamp_ms: log.timestamp_ms,
      operation_id: log.operation.operation_id,
      system_id: log.operation.system_id,
      status: log.result.status,
      rollback_performed: log.result.rollback_performed,
    })),
  };

  return report;
}
