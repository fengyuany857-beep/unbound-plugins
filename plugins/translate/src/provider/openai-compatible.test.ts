import { afterEach, describe, expect, test } from 'bun:test';
import {
  byokTranslationProvider,
  clearTranslationSession,
  configureDeepSeekSession,
  maskProtectedSegments,
  parseChatCompletionText,
  restoreProtectedSegments,
} from './openai-compatible';
import type { TranslationRequest } from '../core/types';

const originalFetch = globalThis.fetch;
afterEach(() => {
  clearTranslationSession();
  globalThis.fetch = originalFetch;
});

describe('OpenAI-compatible BYOK provider', () => {
  test('protects Discord atoms and restores them', () => {
    const source = 'hi <@123> see https://example.com `x=1` @everyone';
    const masked = maskProtectedSegments(source);
    expect(masked.masked).not.toContain('<@123>');
    expect(masked.tokens.length).toBe(4);
    expect(restoreProtectedSegments(masked.masked, masked.tokens)).toBe(source);
  });

  test('parses a chat completion', () => {
    expect(parseChatCompletionText({ choices: [{ message: { content: '  你好  ' } }] })).toBe('你好');
    expect(parseChatCompletionText({ choices: [] })).toBeNull();
  });

  test('calls the DeepSeek-compatible endpoint with a session key', async () => {
    configureDeepSeekSession('sk-test-session-key');
    let seenUrl = '';
    let seenAuthorization = '';
    let seenModel = '';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuthorization = String((init?.headers as Record<string, string>)?.Authorization ?? '');
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      seenModel = body.model ?? '';
      return new Response(JSON.stringify({ choices: [{ message: { content: '你好 [[UB_TOKEN_0]]' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const request: TranslationRequest = {
      key: 'k',
      channelId: 'c',
      messageId: 'm',
      originalText: 'hello <@123>',
      contentFingerprint: 'f',
      sourceLanguage: 'auto',
      targetLanguage: 'zh',
      providerId: 'deepseek-byok',
      priority: 'manual',
      requestSource: 'manual',
    };
    const result = await byokTranslationProvider.translate(request);
    expect(seenUrl).toBe('https://api.deepseek.com/chat/completions');
    expect(seenAuthorization).toBe('Bearer sk-test-session-key');
    expect(seenModel).toBe('deepseek-flash');
    expect(result.translatedText).toBe('你好 <@123>');
  });
});
