/**
 * Tests for cache functionality
 */

import { delay } from '../cache.js';

describe('Cache', () => {
  describe('delay', () => {
    test('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await delay(100);
      const end = Date.now();
      const elapsed = end - start;

      // Allow for some timing variance
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(150);
    });

    test('should resolve promise after delay', async () => {
      const promise = delay(50);
      expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toBeUndefined();
    });
  });
});
