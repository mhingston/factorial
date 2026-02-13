import { exec, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ObservabilityStackConfig {
  worktreeId: string;
  basePort: number;
  dataRoot: string;
  logsRoot: string;
  maxLogStorage?: string;
  maxMetricsStorage?: string;
  maxTracesStorage?: string;
  retentionPeriod?: string;
}

export interface StackStatus {
  running: boolean;
  services: {
    vector: boolean;
    victoriaLogs: boolean;
    victoriaMetrics: boolean;
    victoriaTraces: boolean;
  };
  ports: {
    vector: number;
    victoriaLogs: number;
    victoriaMetrics: number;
    victoriaTraces: number;
  };
  uptime?: number;
  error?: string;
}

export interface StackInfo {
  worktreeId: string;
  config: ObservabilityStackConfig;
  status: StackStatus;
  dataPath: string;
  composePath: string;
}

const DEFAULT_BASE_PORT = 9428;
const MAX_PORT_OFFSET = 1000;

export class ObservabilityStackManager {
  private repoRoot: string;
  private basePath: string;
  private stacks: Map<string, StackInfo> = new Map();

  constructor(options: { repoRoot: string; basePath?: string }) {
    this.repoRoot = options.repoRoot;
    this.basePath = options.basePath ?? join(this.repoRoot, '.factorial', 'observability');
  }

  /**
   * Calculate deterministic port offset from worktree ID
   * Ensures same worktree always gets same ports
   */
  private calculatePortOffset(worktreeId: string): number {
    const hash = createHash('sha256').update(worktreeId).digest('hex');
    const offset = parseInt(hash.slice(0, 8), 16) % MAX_PORT_OFFSET;
    return offset;
  }

  /**
   * Get or create stack configuration for a worktree
   */
  async getStackConfig(worktreeId: string, overrides?: Partial<ObservabilityStackConfig>): Promise<ObservabilityStackConfig> {
    const basePort = parseInt(process.env.FACTORIAL_OBSERVABILITY_BASE_PORT ?? String(DEFAULT_BASE_PORT), 10);
    const offset = this.calculatePortOffset(worktreeId);

    const config: ObservabilityStackConfig = {
      worktreeId,
      basePort: basePort + offset,
      dataRoot: join(this.basePath, worktreeId, 'data'),
      logsRoot: join(this.repoRoot, 'logs'),
      maxLogStorage: '1GB',
      maxMetricsStorage: '512MB',
      maxTracesStorage: '1GB',
      retentionPeriod: '7d',
      ...overrides,
    };

    return config;
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      const { exitCode } = await this.execCommand('docker --version');
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Create and start observability stack for a worktree
   * High-risk invariant OBS-001: Complete isolation between worktrees
   */
  async createStack(config: ObservabilityStackConfig): Promise<StackInfo> {
    // Check if Docker is available
    const dockerAvailable = await this.isDockerAvailable();
    if (!dockerAvailable) {
      throw new Error('Docker is not available. Observability stack requires Docker.');
    }

    // Create stack directory structure
    const stackPath = join(this.basePath, config.worktreeId);
    const dataPath = join(stackPath, 'data');
    const composePath = join(stackPath, 'docker-compose.yml');

    await mkdir(dataPath, { recursive: true });
    await mkdir(join(dataPath, 'victoria-logs'), { recursive: true });
    await mkdir(join(dataPath, 'victoria-metrics'), { recursive: true });
    await mkdir(join(dataPath, 'victoria-traces'), { recursive: true });

    // Calculate ports
    const ports = {
      vector: config.basePort,
      victoriaLogs: config.basePort + 1,
      victoriaMetrics: config.basePort + 2,
      victoriaTraces: config.basePort + 3,
    };

    // Write docker-compose.yml with worktree-specific configuration
    const composeContent = this.generateComposeFile(config, ports);
    await writeFile(composePath, composeContent, 'utf-8');

    // Write ports.json for tracking
    await writeFile(
      join(stackPath, 'ports.json'),
      JSON.stringify({ worktreeId: config.worktreeId, ports, createdAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );

    // Write PID file
    await writeFile(join(stackPath, 'pid'), process.pid.toString(), 'utf-8');

    // Start the stack
    try {
      await this.startStack(config.worktreeId);
    } catch (error) {
      // Clean up on failure
      await this.cleanupStack(config.worktreeId);
      throw new Error(`Failed to start observability stack: ${error instanceof Error ? error.message : String(error)}`);
    }

    const info: StackInfo = {
      worktreeId: config.worktreeId,
      config,
      status: await this.getStackStatus(config.worktreeId),
      dataPath,
      composePath,
    };

    this.stacks.set(config.worktreeId, info);
    return info;
  }

  /**
   * Generate docker-compose.yml content
   */
  private generateComposeFile(config: ObservabilityStackConfig, ports: { vector: number; victoriaLogs: number; victoriaMetrics: number; victoriaTraces: number }): string {
    // Replace template variables
    return `version: '3.8'

services:
  vector:
    image: timberio/vector:0.44.0-distroless-libc
    container_name: factorial-vector-${config.worktreeId}
    volumes:
      - ${join(this.repoRoot, 'docker', 'observability', 'vector.toml')}:/etc/vector/vector.toml:ro
      - ${config.logsRoot}:/logs:ro
    ports:
      - "${ports.vector}:8686"
    environment:
      - VECTOR_CONFIG=/etc/vector/vector.toml
      - WORKTREE_ID=${config.worktreeId}
      - VICTORIA_LOGS_URL=http://victoria-logs:9428
      - VICTORIA_METRICS_URL=http://victoria-metrics:8428
      - VICTORIA_TRACES_URL=http://victoria-traces:9428
    depends_on:
      - victoria-logs
      - victoria-metrics
      - victoria-traces
    networks:
      - factorial-observability-${config.worktreeId}
    deploy:
      resources:
        limits:
          memory: 128M
    restart: unless-stopped

  victoria-logs:
    image: victoriametrics/victoria-logs:v1.7.0-victorialogs
    container_name: factorial-vlogs-${config.worktreeId}
    volumes:
      - ${join(config.dataRoot, 'victoria-logs')}:/victoria-logs-data
    ports:
      - "${ports.victoriaLogs}:9428"
    command:
      - --storageDataPath=/victoria-logs-data
      - --httpListenAddr=:9428
      - --retentionPeriod=${config.retentionPeriod}
      - --maxDiskUsage=${config.maxLogStorage}
      - --loggerFormat=json
    networks:
      - factorial-observability-${config.worktreeId}
    deploy:
      resources:
        limits:
          memory: 512M
    restart: unless-stopped

  victoria-metrics:
    image: victoriametrics/victoria-metrics:v1.110.0
    container_name: factorial-vmetrics-${config.worktreeId}
    volumes:
      - ${join(config.dataRoot, 'victoria-metrics')}:/victoria-metrics-data
    ports:
      - "${ports.victoriaMetrics}:8428"
    command:
      - --storageDataPath=/victoria-metrics-data
      - --httpListenAddr=:8428
      - --retentionPeriod=${config.retentionPeriod}
      - --maxDiskUsage=${config.maxMetricsStorage}
      - --loggerFormat=json
    networks:
      - factorial-observability-${config.worktreeId}
    deploy:
      resources:
        limits:
          memory: 256M
    restart: unless-stopped

  victoria-traces:
    image: victoriametrics/victoria-logs:v1.7.0-victorialogs
    container_name: factorial-vtraces-${config.worktreeId}
    volumes:
      - ${join(config.dataRoot, 'victoria-traces')}:/victoria-traces-data
    ports:
      - "${ports.victoriaTraces}:9428"
    command:
      - --storageDataPath=/victoria-traces-data
      - --httpListenAddr=:9428
      - --retentionPeriod=${config.retentionPeriod}
      - --maxDiskUsage=${config.maxTracesStorage}
      - --loggerFormat=json
    networks:
      - factorial-observability-${config.worktreeId}
    deploy:
      resources:
        limits:
          memory: 512M
    restart: unless-stopped

networks:
  factorial-observability-${config.worktreeId}:
    driver: bridge
    name: factorial-observability-${config.worktreeId}
`;
  }

  /**
   * Start an existing stack
   */
  async startStack(worktreeId: string): Promise<void> {
    const composePath = join(this.basePath, worktreeId, 'docker-compose.yml');

    if (!existsSync(composePath)) {
      throw new Error(`Stack configuration not found for worktree: ${worktreeId}`);
    }

    const { exitCode, stderr } = await this.execCommand(
      `docker compose -f "${composePath}" up -d`,
      { cwd: dirname(composePath) }
    );

    if (exitCode !== 0) {
      throw new Error(`Failed to start stack: ${stderr}`);
    }

    // Wait for services to be healthy
    await this.waitForServices(worktreeId);
  }

  /**
   * Wait for services to be ready
   */
  private async waitForServices(worktreeId: string, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getStackStatus(worktreeId);
        if (status.running && status.services.victoriaLogs && status.services.victoriaMetrics) {
          return;
        }
      } catch {
        // Services not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Timeout waiting for observability stack to be ready`);
  }

  /**
   * Get stack ports from configuration
   */
  private async getStackPorts(worktreeId: string): Promise<{ vector: number; victoriaLogs: number; victoriaMetrics: number; victoriaTraces: number }> {
    const portsPath = join(this.basePath, worktreeId, 'ports.json');

    if (!existsSync(portsPath)) {
      // Calculate from worktree ID
      const config = await this.getStackConfig(worktreeId);
      return {
        vector: config.basePort,
        victoriaLogs: config.basePort + 1,
        victoriaMetrics: config.basePort + 2,
        victoriaTraces: config.basePort + 3,
      };
    }

    const content = await readFile(portsPath, 'utf-8');
    const data = JSON.parse(content);
    return data.ports;
  }

  /**
   * Get current stack status
   */
  async getStackStatus(worktreeId: string): Promise<StackStatus> {
    const composePath = join(this.basePath, worktreeId, 'docker-compose.yml');

    if (!existsSync(composePath)) {
      return {
        running: false,
        services: { vector: false, victoriaLogs: false, victoriaMetrics: false, victoriaTraces: false },
        ports: { vector: 0, victoriaLogs: 0, victoriaMetrics: 0, victoriaTraces: 0 },
        error: 'Stack not found',
      };
    }

    try {
      const { stdout } = await execAsync(`docker compose -f "${composePath}" ps --format json`);
      const containers = JSON.parse(stdout || '[]');

      const services = {
        vector: containers.some((c: { Service?: string; State?: string }) => c.Service === 'vector' && c.State === 'running'),
        victoriaLogs: containers.some((c: { Service?: string; State?: string }) => c.Service === 'victoria-logs' && c.State === 'running'),
        victoriaMetrics: containers.some((c: { Service?: string; State?: string }) => c.Service === 'victoria-metrics' && c.State === 'running'),
        victoriaTraces: containers.some((c: { Service?: string; State?: string }) => c.Service === 'victoria-traces' && c.State === 'running'),
      };

      const ports = await this.getStackPorts(worktreeId);

      return {
        running: Object.values(services).some(Boolean),
        services,
        ports,
      };
    } catch {
      return {
        running: false,
        services: { vector: false, victoriaLogs: false, victoriaMetrics: false, victoriaTraces: false },
        ports: { vector: 0, victoriaLogs: 0, victoriaMetrics: 0, victoriaTraces: 0 },
      };
    }
  }

  /**
   * Stop a stack (OBS-002: Automatic resource cleanup)
   */
  async stopStack(worktreeId: string): Promise<void> {
    const composePath = join(this.basePath, worktreeId, 'docker-compose.yml');

    if (!existsSync(composePath)) {
      return;
    }

    try {
      await this.execCommand(`docker compose -f "${composePath}" down`, {
        cwd: dirname(composePath),
      });
    } catch (error) {
      // Log but don't throw - we're trying to clean up
      console.warn(`Warning: Error stopping stack for ${worktreeId}: ${error}`);
    }
  }

  /**
   * Clean up and remove a stack
   */
  async cleanupStack(worktreeId: string): Promise<void> {
    // Stop services first
    await this.stopStack(worktreeId);

    // Remove data directory
    const stackPath = join(this.basePath, worktreeId);
    if (existsSync(stackPath)) {
      await rm(stackPath, { recursive: true, force: true });
    }

    this.stacks.delete(worktreeId);
  }

  /**
   * Clean up all stacks
   */
  async cleanupAll(): Promise<void> {
    const worktreeIds = Array.from(this.stacks.keys());
    await Promise.all(worktreeIds.map(id => this.cleanupStack(id)));
  }

  /**
   * List all managed stacks
   */
  async listStacks(): Promise<StackInfo[]> {
    const stacks: StackInfo[] = [];

    try {
      const entries = await readdir(this.basePath);
      for (const entry of entries) {
        const stackPath = join(this.basePath, entry);
        const entryStat = await stat(stackPath);
        if (entryStat.isDirectory()) {
          const config = await this.getStackConfig(entry);
          const status = await this.getStackStatus(entry);
          stacks.push({
            worktreeId: entry,
            config,
            status,
            dataPath: join(stackPath, 'data'),
            composePath: join(stackPath, 'docker-compose.yml'),
          });
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return stacks;
  }

  /**
   * Execute command with proper error handling
   */
  private async execCommand(command: string, options?: { cwd?: string }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, {
        shell: true,
        cwd: options?.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });

      child.on('error', (error) => {
        resolve({ exitCode: 1, stdout: '', stderr: error.message });
      });
    });
  }
}
