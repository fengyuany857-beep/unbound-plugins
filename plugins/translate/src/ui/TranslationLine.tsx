import { metro } from '@unbound-app/api';

export default function TranslationLine({ translatedText }: { translatedText: string }) {
  const ReactNative = metro.common.ReactNative;
  const colors = ((metro.common.Theme as any)?.colors ?? {}) as Record<string, unknown>;
  const muted = typeof colors.TEXT_MUTED === 'string' ? colors.TEXT_MUTED as string : '#b5bac1';
  return <ReactNative.Text style={{ color: muted, fontSize: 14, lineHeight: 19, paddingTop: 2 }}>{translatedText}</ReactNative.Text>;
}
