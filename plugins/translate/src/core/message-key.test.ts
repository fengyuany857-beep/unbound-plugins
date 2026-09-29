import { describe, expect, test } from 'bun:test';
import { createTranslationKey, fingerprintText } from './message-key';

describe('translation key', () => {
  test('is deterministic and content-sensitive', () => {
    expect(fingerprintText('abc')).toBe(fingerprintText('abc'));
    expect(fingerprintText('abc')).not.toBe(fingerprintText('abd'));
  });
  test('changes when content or target language changes', () => {
    const base = { channelId: 'c', messageId: 'm', text: 'hello', targetLanguage: 'zh', providerId: 'unbound' };
    expect(createTranslationKey(base).key).not.toBe(createTranslationKey({ ...base, text: 'hello!' }).key);
    expect(createTranslationKey(base).key).not.toBe(createTranslationKey({ ...base, targetLanguage: 'ja' }).key);
  });
});
