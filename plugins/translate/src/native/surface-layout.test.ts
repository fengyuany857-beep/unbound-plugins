import { describe, expect, test } from 'bun:test';
import { BottomAnchorTracker, bottomOffsetCorrection, readBottomAnchor, SurfaceHeightCache, surfaceHeightCacheKey, type SurfaceLayoutMetrics } from './surface-layout';
const metrics = (overrides: Partial<SurfaceLayoutMetrics> = {}): SurfaceLayoutMetrics => ({ bottomInset: 0, contentHeight: 1600, inverted: false, offsetX: 0, offsetY: 1000, topInset: 0, viewportHeight: 600, ...overrides });
describe('translation surface layout', () => {
  test('preserves bottom anchor across row growth', () => {
    const anchor = readBottomAnchor(metrics());
    expect(anchor.atBottom).toBe(true);
    expect(bottomOffsetCorrection(anchor, metrics({ contentHeight: 1640, offsetY: 950 }), false)).toEqual({ x: 0, y: 1040 });
  });
  test('waits for an actual content height delta', () => {
    const tracker = new BottomAnchorTracker(); tracker.capture(readBottomAnchor(metrics()));
    expect(tracker.correction(metrics(), false)).toBeUndefined();
    expect(tracker.correction(metrics({ contentHeight: 1640 }), false)).toEqual({ x: 0, y: 1040 });
  });
  test('height cache is bounded and translation-key aware', () => {
    const cache = new SurfaceHeightCache(2); const first = surfaceHeightCacheKey('a', 320); const second = surfaceHeightCacheKey('b', 320);
    cache.set(first, 44); expect(cache.get(first, 28)).toBe(44); expect(cache.get(second, 28)).toBe(28);
  });
});
