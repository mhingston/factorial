import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOP_DETECTION_CONFIG,
  LoopDetector,
  createExecutionSignature,
  detectLoop,
} from './loop-detector.js';

describe('Loop Detection', () => {
  describe('createExecutionSignature', () => {
    it('creates deterministic signatures', () => {
      const sig1 = createExecutionSignature('node1', 'codergen', 'prompt text', 'SUCCESS');
      const sig2 = createExecutionSignature('node1', 'codergen', 'prompt text', 'SUCCESS');
      
      expect(sig1.nodeId).toBe('node1');
      expect(sig1.nodeType).toBe('codergen');
      expect(sig1.outcomeStatus).toBe('SUCCESS');
      expect(sig1.promptHash).toBe(sig2.promptHash);
      expect(sig1.timestamp).toBeDefined();
    });

    it('creates different hashes for different prompts', () => {
      const sig1 = createExecutionSignature('node1', 'codergen', 'prompt A', 'SUCCESS');
      const sig2 = createExecutionSignature('node1', 'codergen', 'prompt B', 'SUCCESS');
      
      expect(sig1.promptHash).not.toBe(sig2.promptHash);
    });
  });

  describe('detectLoop', () => {
    it('returns no loop for empty history', () => {
      const result = detectLoop([]);
      expect(result.detected).toBe(false);
    });

    it('returns no loop for short history', () => {
      const sigs = Array(5).fill(null).map((_, i) => 
        createExecutionSignature(`node${i}`, 'codergen', `prompt ${i}`, 'SUCCESS')
      );
      const result = detectLoop(sigs);
      expect(result.detected).toBe(false);
    });

    it('detects length-1 repeating pattern', () => {
      // Same node failing 10 times in a row
      const sigs = Array(10).fill(null).map(() => 
        createExecutionSignature('retry_node', 'codergen', 'same prompt', 'RETRY')
      );
      
      const result = detectLoop(sigs);
      expect(result.detected).toBe(true);
      expect(result.pattern).toHaveLength(1);
      expect(result.pattern[0]).toContain('retry_node');
      expect(result.pattern[0]).toContain('RETRY');
      expect(result.message).toContain('Loop detected');
      expect(result.message).toContain('1 cycle');
    });

    it('detects length-2 repeating pattern', () => {
      // A -> B -> A -> B pattern
      const sigs = [
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'FAIL'),
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'FAIL'),
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'FAIL'),
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'FAIL'),
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'FAIL'),
      ];
      
      const result = detectLoop(sigs);
      expect(result.detected).toBe(true);
      expect(result.pattern).toHaveLength(2);
      expect(result.message).toContain('2 cycle');
    });

    it('detects length-3 repeating pattern', () => {
      // A -> B -> C -> A -> B -> C -> A -> B -> C pattern (9 items = 3 complete cycles)
      const sigs = [
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'SUCCESS'),
        createExecutionSignature('nodeC', 'codergen', 'prompt C', 'FAIL'),
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'SUCCESS'),
        createExecutionSignature('nodeC', 'codergen', 'prompt C', 'FAIL'),
        createExecutionSignature('nodeA', 'codergen', 'prompt A', 'SUCCESS'),
        createExecutionSignature('nodeB', 'codergen', 'prompt B', 'SUCCESS'),
        createExecutionSignature('nodeC', 'codergen', 'prompt C', 'FAIL'),
      ];
      
      const result = detectLoop(sigs, { ...DEFAULT_LOOP_DETECTION_CONFIG, windowSize: 9 });
      expect(result.detected).toBe(true);
      expect(result.pattern).toHaveLength(3);
      expect(result.message).toContain('3 cycle');
    });

    it('does not detect loop in non-repeating sequence', () => {
      // Progressing through different nodes
      const sigs = Array(10).fill(null).map((_, i) => 
        createExecutionSignature(`node${i}`, 'codergen', `prompt ${i}`, 'SUCCESS')
      );
      
      const result = detectLoop(sigs);
      expect(result.detected).toBe(false);
    });

    it('respects disabled config', () => {
      const sigs = Array(10).fill(null).map(() => 
        createExecutionSignature('same_node', 'codergen', 'same', 'RETRY')
      );
      
      const result = detectLoop(sigs, { ...DEFAULT_LOOP_DETECTION_CONFIG, enabled: false });
      expect(result.detected).toBe(false);
    });

    it('respects custom window size', () => {
      // Pattern in first 5, different after
      const sigs = [
        ...Array(5).fill(null).map(() => 
          createExecutionSignature('same_node', 'codergen', 'same', 'RETRY')
        ),
        ...Array(5).fill(null).map((_, i) => 
          createExecutionSignature(`node${i}`, 'codergen', `different ${i}`, 'SUCCESS')
        ),
      ];
      
      // With window size 10, no loop (different endings)
      const result10 = detectLoop(sigs, { ...DEFAULT_LOOP_DETECTION_CONFIG, windowSize: 10 });
      expect(result10.detected).toBe(false);
      
      // With window size 5, should detect loop in first 5
      const result5 = detectLoop(sigs.slice(0, 5), { ...DEFAULT_LOOP_DETECTION_CONFIG, windowSize: 5 });
      expect(result5.detected).toBe(true);
    });
  });

  describe('LoopDetector class', () => {
    it('records and detects loops', () => {
      const detector = new LoopDetector();
      
      // Record 10 identical executions
      for (let i = 0; i < 10; i++) {
        detector.record('stuck_node', 'codergen', 'same prompt every time', 'RETRY');
      }
      
      const result = detector.check();
      expect(result.detected).toBe(true);
      expect(result.message).toContain('stuck_node');
    });

    it('returns no loop before window size reached', () => {
      const detector = new LoopDetector();
      
      // Record only 5 identical executions
      for (let i = 0; i < 5; i++) {
        detector.record('stuck_node', 'codergen', 'same prompt', 'RETRY');
      }
      
      const result = detector.check();
      expect(result.detected).toBe(false);
    });

    it('provides recent signatures', () => {
      const detector = new LoopDetector();
      
      detector.record('node1', 'codergen', 'prompt1', 'SUCCESS');
      detector.record('node2', 'codergen', 'prompt2', 'FAIL');
      detector.record('node3', 'codergen', 'prompt3', 'SUCCESS');
      
      const recent = detector.getRecentSignatures(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].nodeId).toBe('node2');
      expect(recent[1].nodeId).toBe('node3');
    });

    it('clears signatures', () => {
      const detector = new LoopDetector();
      
      for (let i = 0; i < 10; i++) {
        detector.record('stuck_node', 'codergen', 'same', 'RETRY');
      }
      
      expect(detector.check().detected).toBe(true);
      
      detector.clear();
      expect(detector.check().detected).toBe(false);
      expect(detector.getRecentSignatures()).toHaveLength(0);
    });

    it('does not record when disabled', () => {
      const detector = new LoopDetector({ enabled: false });
      
      for (let i = 0; i < 10; i++) {
        detector.record('stuck_node', 'codergen', 'same', 'RETRY');
      }
      
      expect(detector.check().detected).toBe(false);
      expect(detector.getRecentSignatures()).toHaveLength(0);
    });
  });
});
