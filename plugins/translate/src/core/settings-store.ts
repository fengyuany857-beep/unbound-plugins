import { storage } from '@unbound-app/api';
import type { TranslationSettings } from './types';

export const SETTINGS_STORE_ID = 'unbound.translate';
export const DEFAULT_SOURCE_LANGUAGE = 'auto';
export const DEFAULT_TARGET_LANGUAGE = 'zh';

export const SETTINGS = storage.getStore(SETTINGS_STORE_ID);

export function getTranslationSettings(): TranslationSettings {
  return {
    autoTranslateEnabled: SETTINGS.get('autoTranslateEnabled', false),
    sourceLanguage: SETTINGS.get('sourceLanguage', DEFAULT_SOURCE_LANGUAGE),
    targetLanguage: SETTINGS.get('targetLanguage', DEFAULT_TARGET_LANGUAGE),
    translateOwnMessages: SETTINGS.get('translateOwnMessages', false),
    translateBotMessages: SETTINGS.get('translateBotMessages', true),
    skipCodeOnly: SETTINGS.get('skipCodeOnly', true),
    skipLinkOnly: SETTINGS.get('skipLinkOnly', true),
    displayMode: 'bilingual',
  };
}

export function getSourceLanguage(): string { return getTranslationSettings().sourceLanguage; }
export function getTargetLanguage(): string { return getTranslationSettings().targetLanguage; }
export function setSourceLanguage(code: string): void { SETTINGS.set('sourceLanguage', code); }
export function setTargetLanguage(code: string): void { SETTINGS.set('targetLanguage', code); }
export function setAutoTranslateEnabled(value: boolean): void { SETTINGS.set('autoTranslateEnabled', value); }
export function setTranslateOwnMessages(value: boolean): void { SETTINGS.set('translateOwnMessages', value); }
export function setTranslateBotMessages(value: boolean): void { SETTINGS.set('translateBotMessages', value); }
export function setSkipCodeOnly(value: boolean): void { SETTINGS.set('skipCodeOnly', value); }
export function setSkipLinkOnly(value: boolean): void { SETTINGS.set('skipLinkOnly', value); }
