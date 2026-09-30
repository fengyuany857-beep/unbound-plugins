import { useEffect, useState } from 'react';
import { metro } from '@unbound-app/api';
import type { RawMessage, TranslationController } from '../core/controller';
import { translationStore } from '../core/translation-store';

type Props = {
  controller: TranslationController;
  message: RawMessage;
};

export default function TranslationInline({ controller, message }: Props) {
  const key = controller.getTranslationKeyForMessage(message);
  const [entry, setEntry] = useState(() => key ? translationStore.getEntry(key) : undefined);

  useEffect(() => {
    if (!key) {
      setEntry(undefined);
      return;
    }
    setEntry(translationStore.getEntry(key));
    return translationStore.subscribe(key, setEntry);
  }, [key]);

  const current = entry?.key === key ? entry : key ? translationStore.getEntry(key) : undefined;
  if (!current || current.state !== 'ready' || current.hidden || !current.translatedText) return null;

  const ReactNative = metro.common.ReactNative;
  const colors = ((metro.common.Theme as any)?.colors ?? {}) as Record<string, unknown>;
  const muted = typeof colors.TEXT_MUTED === 'string' ? colors.TEXT_MUTED as string : '#b5bac1';

  return (
    <ReactNative.Text
      accessibilityLabel={'Translation: ' + current.translatedText}
      style={{ color: muted, fontSize: 14, lineHeight: 19, opacity: 0.9 }}
    >
      {'\n' + current.translatedText}
    </ReactNative.Text>
  );
}
