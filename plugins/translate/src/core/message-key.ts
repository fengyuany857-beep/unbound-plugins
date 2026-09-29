export function normalizeMessageText(text: string): string {
  return text.replace(/\r\n?/g, '\n').normalize('NFC');
}

export function fingerprintText(text: string): string {
  const normalized = normalizeMessageText(text);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function createTranslationKey(input: {
  channelId: string;
  messageId: string;
  text: string;
  targetLanguage: string;
  providerId: string;
}): { key: string; contentFingerprint: string } {
  const contentFingerprint = fingerprintText(input.text);
  return {
    key: `${input.channelId}:${input.messageId}:${contentFingerprint}:${input.targetLanguage}:${input.providerId}`,
    contentFingerprint,
  };
}
