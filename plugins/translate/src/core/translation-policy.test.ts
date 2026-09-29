import { describe, expect, test } from 'bun:test';
import { probablyTargetLanguage, shouldTranslate } from './translation-policy';
import type { TranslationSettings } from './types';
const settings: TranslationSettings = { autoTranslateEnabled: true, sourceLanguage: 'auto', targetLanguage: 'zh', translateOwnMessages: false, translateBotMessages: true, skipCodeOnly: true, skipLinkOnly: true, displayMode: 'bilingual' };
const msg = (content: string) => ({ channelId: 'c', messageId: 'm', content });
describe('translation policy', () => {
  test('skips links/code/own messages', () => {
    expect(shouldTranslate(msg('https://example.com'), settings).reason).toBe('link-only');
    expect(shouldTranslate(msg('```js\n1+1\n```'), settings).reason).toBe('code-only');
    expect(shouldTranslate({ ...msg('hello'), authorId: 'me' }, settings, { currentUserId: 'me' }).reason).toBe('own-message');
  });
  test('conservatively skips likely Chinese target text', () => {
    expect(probablyTargetLanguage('这是一个中文句子', 'zh')).toBe(true);
    expect(shouldTranslate(msg('hello world'), settings).eligible).toBe(true);
  });
  test('manual translation bypasses auto toggle', () => {
    expect(shouldTranslate(msg('hello'), { ...settings, autoTranslateEnabled: false }, { manual: true }).eligible).toBe(true);
  });
});
