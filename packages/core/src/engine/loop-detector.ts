/**
 * Loop detection for agentic workflows per coding-agent-loop spec Section 2.10
 * 
 * Detects repeating patterns in node execution signatures to prevent
 * infinite loops and compounding errors in long-horizon workflows.
 */

export interface ExecutionSignature {
  nodeId: string;
  nodeType: string;
  promptHash: string;
  outcomeStatus: string;
  timestamp: string;
}

export interface LoopDetectionConfig {
  enabled: boolean;
  windowSize: number;
  patternLengths: number[];
}

export const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  enabled: true,
  windowSize: 10,
  patternLengths: [1, 2, 3],
};

/**
 * Simple hash function for strings (FNV-1a inspired)
 */
function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Creates a signature for a node execution
 */
export function createExecutionSignature(
  nodeId: string,
  nodeType: string,
  prompt: string,
  outcomeStatus: string
): ExecutionSignature {
  return {
    nodeId,
    nodeType,
    promptHash: hashString(prompt),
    outcomeStatus,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Converts a signature to a comparable string
 */
function signatureToString(sig: ExecutionSignature): string {
  return `${sig.nodeId}:${sig.nodeType}:${sig.promptHash}:${sig.outcomeStatus}`;
}

/**
 * Detects repeating patterns in execution history
 * 
 * Per coding-agent-loop spec Section 2.10:
 * - Checks for patterns of length 1, 2, or 3
 * - Operates over a sliding window (default: 10 executions)
 * - Returns true if the last N executions follow a repeating pattern
 */
export function detectLoop(
  signatures: ExecutionSignature[],
  config: LoopDetectionConfig = DEFAULT_LOOP_DETECTION_CONFIG
): { detected: boolean; pattern: string[]; message: string } {
  if (!config.enabled || signatures.length < config.windowSize) {
    return { detected: false, pattern: [], message: '' };
  }

  // Get recent signatures within window
  const recent = signatures.slice(-config.windowSize);
  const recentStrings = recent.map(signatureToString);

  // Check for repeating patterns of configured lengths
  for (const patternLength of config.patternLengths) {
    if (config.windowSize % patternLength !== 0) {
      continue;
    }

    const pattern = recentStrings.slice(0, patternLength);
    let allMatch = true;

    for (let i = patternLength; i < config.windowSize; i += patternLength) {
      const segment = recentStrings.slice(i, i + patternLength);
      for (let j = 0; j < patternLength; j++) {
        if (segment[j] !== pattern[j]) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) break;
    }

    if (allMatch) {
      const readablePattern = pattern.map(p => {
        const parts = p.split(':');
        return `${parts[0]}(${parts[3]})`;
      });
      
      return {
        detected: true,
        pattern: readablePattern,
        message: `Loop detected: the last ${config.windowSize} executions follow a repeating pattern (${patternLength} cycle). ` +
          `Pattern: ${readablePattern.join(' → ')}. ` +
          `Try a different approach or check for stuck conditions.`,
      };
    }
  }

  return { detected: false, pattern: [], message: '' };
}

/**
 * Loop detector that maintains execution history and provides warnings
 */
export class LoopDetector {
  private signatures: ExecutionSignature[] = [];
  private config: LoopDetectionConfig;

  constructor(config: Partial<LoopDetectionConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };
  }

  /**
   * Record a node execution signature
   */
  record(nodeId: string, nodeType: string, prompt: string, outcomeStatus: string): void {
    if (!this.config.enabled) return;
    
    const signature = createExecutionSignature(nodeId, nodeType, prompt, outcomeStatus);
    this.signatures.push(signature);
    
    // Keep only recent signatures to manage memory
    if (this.signatures.length > this.config.windowSize * 2) {
      this.signatures = this.signatures.slice(-this.config.windowSize);
    }
  }

  /**
   * Check if a loop pattern is detected
   */
  check(): { detected: boolean; pattern: string[]; message: string } {
    return detectLoop(this.signatures, this.config);
  }

  /**
   * Get recent signatures for debugging
   */
  getRecentSignatures(count: number = 10): ExecutionSignature[] {
    return this.signatures.slice(-count);
  }

  /**
   * Clear all recorded signatures
   */
  clear(): void {
    this.signatures = [];
  }
}
