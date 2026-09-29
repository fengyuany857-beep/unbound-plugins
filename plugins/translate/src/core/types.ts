export type TranslationState = 'idle' | 'skipped' | 'queued' | 'translating' | 'ready' | 'error';
export type RequestPriority = 'manual' | 'visible';
export type RequestSource = 'auto' | 'manual';

export type MessageIdentity = {
  channelId: string;
  messageId: string;
  content: string;
  editedTimestamp?: string | null;
  authorId?: string;
  bot?: boolean;
};

export type TranslationRequest = {
  key: string;
  channelId: string;
  messageId: string;
  originalText: string;
  contentFingerprint: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  priority: RequestPriority;
  requestSource: RequestSource;
};

export type TranslationResult = {
  key: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  completedAt: number;
};

export type TranslationEntry = {
  key: string;
  channelId: string;
  messageId: string;
  originalText: string;
  translatedText?: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  state: TranslationState;
  hidden: boolean;
  error?: string;
  updatedAt: number;
};

export type PolicyReason =
  | 'eligible'
  | 'disabled'
  | 'empty'
  | 'emoji-only'
  | 'link-only'
  | 'code-only'
  | 'own-message'
  | 'bot-disabled'
  | 'same-language';

export type PolicyDecision = {
  eligible: boolean;
  reason: PolicyReason;
};

export type TranslationSettings = {
  autoTranslateEnabled: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  translateOwnMessages: boolean;
  translateBotMessages: boolean;
  skipCodeOnly: boolean;
  skipLinkOnly: boolean;
  displayMode: 'bilingual';
};
