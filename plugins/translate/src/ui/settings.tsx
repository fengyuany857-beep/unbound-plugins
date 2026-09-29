import { useState } from 'react';
import { metro, toasts } from '@unbound-app/api';
import { SettingsRow, SettingsScrollView, SettingsSection, SettingsSwitchRow } from '@shared/settings-ui';
import { openDiscordLoginFlow } from '../auth/oauth';
import {
  SETTINGS,
  getSourceLanguage,
  getTargetLanguage,
  setAutoTranslateEnabled,
  setSkipCodeOnly,
  setSkipLinkOnly,
  setSourceLanguage,
  setTargetLanguage,
  setTranslateBotMessages,
  setTranslateOwnMessages,
} from '../core/settings-store';
import { hasRefreshToken } from '../provider/unbound';
import LanguagePickerSheet from './sheets/LanguagePickerSheet';

function openLanguageSheet(options: { title: string; current: string; includeAuto?: boolean; onSelect: (code: string) => void }) {
  const sheets = typeof metro?.findByProps === 'function' ? metro.findByProps('openLazy', 'hideActionSheet') as any : null;
  if (!sheets) { toasts.showToast({ title: 'Translate', content: 'Language picker is unavailable.' }); return; }
  const key = `unbound-translate-${options.title}-${options.current}`;
  sheets.openLazy(Promise.resolve({ default: LanguagePickerSheet }), key, { ...options, onClose: () => sheets.hideActionSheet(key) });
}

export function TranslationSettingsScreen() {
  const state = SETTINGS.useSettingsStore();
  const refreshConfigured = hasRefreshToken() || Boolean(state.get('refreshToken', ''));
  const [connecting, setConnecting] = useState(false);
  const sourceLanguage = getSourceLanguage();
  const targetLanguage = getTargetLanguage();
  const autoTranslate = state.get('autoTranslateEnabled', true);
  const own = state.get('translateOwnMessages', false);
  const bots = state.get('translateBotMessages', true);
  const skipCode = state.get('skipCodeOnly', true);
  const skipLinks = state.get('skipLinkOnly', true);
  return <SettingsScrollView>
    <SettingsSection title='General'>
      <SettingsSwitchRow label='Auto Translate' description='Translate eligible messages when they become visible.' value={autoTranslate} onValueChange={setAutoTranslateEnabled} />
      <SettingsRow label='Source Language' description={sourceLanguage} arrow disabled={!refreshConfigured} onPress={() => refreshConfigured && openLanguageSheet({ title: 'Select source language', current: sourceLanguage, includeAuto: true, onSelect: setSourceLanguage })} />
      <SettingsRow label='Target Language' description={targetLanguage} arrow disabled={!refreshConfigured} onPress={() => refreshConfigured && openLanguageSheet({ title: 'Select target language', current: targetLanguage, onSelect: setTargetLanguage })} />
    </SettingsSection>
    <SettingsSection title='Automatic Translation'>
      <SettingsSwitchRow label='Translate My Messages' value={own} onValueChange={setTranslateOwnMessages} />
      <SettingsSwitchRow label='Translate Bot Messages' value={bots} onValueChange={setTranslateBotMessages} />
      <SettingsSwitchRow label='Skip Code-only Messages' value={skipCode} onValueChange={setSkipCodeOnly} />
      <SettingsSwitchRow label='Skip Link-only Messages' value={skipLinks} onValueChange={setSkipLinkOnly} />
    </SettingsSection>
    <SettingsSection title='Account'>
      <SettingsRow label={connecting ? 'Connecting Discord account…' : refreshConfigured ? 'Reconnect Discord account' : 'Connect Discord account'} description={connecting ? 'Finishing Discord authorization' : refreshConfigured ? 'Translation service connected' : 'Sign in to enable translation'} disabled={connecting} onPress={() => { setConnecting(true); openDiscordLoginFlow(() => setConnecting(false)); }} />
    </SettingsSection>
  </SettingsScrollView>;
}
