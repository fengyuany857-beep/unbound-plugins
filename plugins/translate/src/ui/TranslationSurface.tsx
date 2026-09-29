import { useEffect, useState } from 'react';
import { metro } from '@unbound-app/api';
import { translationStore } from '../core/translation-store';
import { reportSurfaceLayout } from '../native/surface-registry';
import TranslationLine from './TranslationLine';

export default function TranslationSurface({ surfaceId, translationKey }: { surfaceId: string; translationKey: string }) {
  const ReactNative = metro.common.ReactNative;
  const [entry, setEntry] = useState(() => translationStore.getEntry(translationKey));
  useEffect(() => {
    setEntry(translationStore.getEntry(translationKey));
    return translationStore.subscribe(translationKey, setEntry);
  }, [translationKey]);
  const ready = entry?.state === 'ready' && !entry.hidden && typeof entry.translatedText === 'string' && entry.translatedText.length > 0;
  return <ReactNative.View
    onLayout={(event: any) => {
      const height = Number(event?.nativeEvent?.layout?.height);
      if (height > 0) reportSurfaceLayout(surfaceId, height);
    }}
    style={{ minHeight: ready ? 22 : 1, width: '100%' }}
  >{ready ? <TranslationLine translatedText={entry.translatedText!} /> : null}</ReactNative.View>;
}
