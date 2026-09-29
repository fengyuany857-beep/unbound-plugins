import { describe, expect, test } from 'bun:test';
import { TranslationCache } from './translation-cache';

const result = (key: string) => ({ key, translatedText: key, sourceLanguage: 'en', targetLanguage: 'zh', providerId: 'x', completedAt: 1 });
describe('TranslationCache', () => {
  test('is bounded LRU', () => {
    const cache = new TranslationCache(2);
    cache.set(result('a')); cache.set(result('b')); cache.get('a'); cache.set(result('c'));
    expect(cache.get('a')?.translatedText).toBe('a');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')?.translatedText).toBe('c');
  });
});
