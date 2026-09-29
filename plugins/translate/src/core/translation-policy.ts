import type { MessageIdentity, PolicyDecision, TranslationSettings } from './types';

const URL_ONLY = /^(?:https?:\/\/\S+|www\.\S+)$/i;
const FENCED_CODE = /^```[\s\S]*```$/;
const INLINE_CODE = /^`[^`]+`$/;
const EMOJI_ONLY = /^(?:\s|<a?:[A-Za-z0-9_~]+:\d+>|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D])+$/u;

export function isEmptyText(text: string): boolean {
  return text.trim().length === 0;
}

export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && EMOJI_ONLY.test(trimmed);
}

export function isLinkOnly(text: string): boolean {
  return URL_ONLY.test(text.trim());
}

export function isCodeOnly(text: string): boolean {
  const trimmed = text.trim();
  return FENCED_CODE.test(trimmed) || INLINE_CODE.test(trimmed);
}

export function probablyTargetLanguage(text: string, targetLanguage: string): boolean {
  const visible = text.replace(/https?:\/\/\S+/g, '').replace(/\s/g, '');
  if (!visible) return false;

  if (targetLanguage === 'zh') {
    const han = [...visible].filter((character) => /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(character)).length;
    const latin = [...visible].filter((character) => /[A-Za-z]/.test(character)).length;
    return han >= 3 && han >= latin * 1.25;
  }
  if (targetLanguage === 'ja') {
    return /[\u3040-\u30FF]/u.test(visible);
  }
  if (targetLanguage === 'ko') {
    return /[\uAC00-\uD7AF]/u.test(visible);
  }
  return false;
}

export function shouldTranslate(
  message: MessageIdentity,
  settings: TranslationSettings,
  context: { currentUserId?: string; manual?: boolean } = {},
): PolicyDecision {
  if (isEmptyText(message.content)) return { eligible: false, reason: 'empty' };
  if (context.manual) return { eligible: true, reason: 'eligible' };
  if (!settings.autoTranslateEnabled) return { eligible: false, reason: 'disabled' };
  if (isEmojiOnly(message.content)) return { eligible: false, reason: 'emoji-only' };
  if (settings.skipLinkOnly && isLinkOnly(message.content)) return { eligible: false, reason: 'link-only' };
  if (settings.skipCodeOnly && isCodeOnly(message.content)) return { eligible: false, reason: 'code-only' };
  if (!settings.translateOwnMessages && context.currentUserId && message.authorId === context.currentUserId) {
    return { eligible: false, reason: 'own-message' };
  }
  if (!settings.translateBotMessages && message.bot) return { eligible: false, reason: 'bot-disabled' };
  if (probablyTargetLanguage(message.content, settings.targetLanguage)) {
    return { eligible: false, reason: 'same-language' };
  }
  return { eligible: true, reason: 'eligible' };
}
