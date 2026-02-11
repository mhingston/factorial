import { describe, it, expect } from 'vitest';
import { SHAPE_TO_TYPE, DEFAULT_BACKOFF_CONFIG, DEFAULT_RETRY_POLICIES } from './index.js';

describe('Types', () => {
  describe('SHAPE_TO_TYPE', () => {
    it('should map Mdiamond to start', () => {
      expect(SHAPE_TO_TYPE.Mdiamond).toBe('start');
    });

    it('should map Msquare to exit', () => {
      expect(SHAPE_TO_TYPE.Msquare).toBe('exit');
    });

    it('should map box to codergen', () => {
      expect(SHAPE_TO_TYPE.box).toBe('codergen');
    });

    it('should map circle to start', () => {
      expect(SHAPE_TO_TYPE.circle).toBe('start');
    });

    it('should map doublecircle to exit', () => {
      expect(SHAPE_TO_TYPE.doublecircle).toBe('exit');
    });
  });

  describe('DEFAULT_BACKOFF_CONFIG', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_BACKOFF_CONFIG.initial_delay_ms).toBe(200);
      expect(DEFAULT_BACKOFF_CONFIG.backoff_factor).toBe(2.0);
      expect(DEFAULT_BACKOFF_CONFIG.max_delay_ms).toBe(60000);
      expect(DEFAULT_BACKOFF_CONFIG.jitter).toBe(true);
    });
  });

  describe('DEFAULT_RETRY_POLICIES', () => {
    it('should have none policy with 1 attempt', () => {
      expect(DEFAULT_RETRY_POLICIES.none.max_attempts).toBe(1);
    });

    it('should have standard policy with 5 attempts', () => {
      expect(DEFAULT_RETRY_POLICIES.standard.max_attempts).toBe(5);
    });
  });
});
