import { useEffect, useMemo, useState } from 'react';
import { assets, metro } from '@unbound-app/api';
import { listLanguages } from '../../provider/unbound';
import type { TranslationLanguage } from '../../provider/types';

type Props = { title: string; includeAuto?: boolean; current: string; onSelect: (code: string) => void; onClose: () => void };

function getDesignModule(): any | null {
  const discord = (metro as any)?.components?.Discord;
  if (discord?.ActionSheet && discord?.TextField && discord?.ActionSheetRow) return discord;
  if (typeof metro?.findByProps === 'function') {
    const found = metro.findByProps('ActionSheet', 'TextField', 'ActionSheetRow') as any;
    if (found?.ActionSheet && found?.TextField && found?.ActionSheetRow) return found;
  }
  return null;
}

function languageLabel(language: TranslationLanguage): string {
  return language.nativeName && language.nativeName !== language.name ? `${language.name} (${language.nativeName})` : language.name;
}

export default function LanguagePickerSheet({ title, includeAuto, current, onSelect, onClose }: Props) {
  const ReactNative = metro.common.ReactNative;
  const Discord = getDesignModule();
  const [query, setQuery] = useState('');
  const [languages, setLanguages] = useState<TranslationLanguage[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listLanguages().then((loaded) => { if (!cancelled) setLanguages(loaded); }, (err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, []);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = languages.filter((language) => !q || language.code.toLowerCase().includes(q) || language.name.toLowerCase().includes(q) || language.nativeName?.toLowerCase().includes(q));
    return includeAuto ? [{ code: 'auto', name: 'Auto detect' } as TranslationLanguage, ...matches] : matches;
  }, [includeAuto, languages, query]);
  const choose = (code: string) => { onSelect(code); onClose(); };
  if (!Discord?.ActionSheet || !Discord?.TextField || !Discord?.ActionSheetRow) return <ReactNative.View style={{ padding: 16 }}><ReactNative.Text>Language picker is unavailable on this client build.</ReactNative.Text></ReactNative.View>;
  const checkIconId = assets.getIDByName('CheckmarkLargeIcon') ?? assets.getIDByName('CheckIcon') ?? assets.Icons?.CheckmarkIcon;
  const RowGroup = Discord.ActionSheetRowGroup ?? ReactNative.View;
  return <Discord.ActionSheet>
    {Discord.Text ? <Discord.Text variant='heading-lg/semibold' style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>{title}</Discord.Text> : null}
    <ReactNative.View style={{ paddingHorizontal: 16, paddingBottom: 12 }}><Discord.TextField size='md' value={query} onChange={setQuery} isClearable isRound placeholder='Search languages' /></ReactNative.View>
    {error ? <Discord.ActionSheetRow label={error} onPress={onClose} /> : <RowGroup>{rows.map((language) => <Discord.ActionSheetRow key={language.code} label={language.code === 'auto' ? 'Auto detect' : languageLabel(language)} subLabel={language.code} icon={language.code === current && checkIconId ? <Discord.ActionSheetRow.Icon source={checkIconId} /> : undefined} onPress={() => choose(language.code)} />)}{rows.length === 0 ? <Discord.ActionSheetRow label='No matches' onPress={onClose} /> : null}</RowGroup>}
  </Discord.ActionSheet>;
}
