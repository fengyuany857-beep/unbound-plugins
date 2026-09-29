import type { NativeObjectHandle } from '@unbound-app/api/native';
import { nativeCall, textForView, textViewsInView } from './message-cell';
import type { TranslationRuntime } from './runtime';

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().normalize('NFC');
}

function stripDiscordMarkup(value: string): string {
  return normalize(value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?|```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1'));
}

export function scoreRenderedTextCandidate(rendered: string, rawContent: string): number {
  const renderedNorm = normalize(rendered);
  const rawNorm = normalize(rawContent);
  if (!renderedNorm || !rawNorm) return -1;
  if (renderedNorm === rawNorm) return 100;
  const stripped = stripDiscordMarkup(rawContent);
  if (renderedNorm === stripped) return 92;
  if (rawNorm.length >= 6 && renderedNorm.includes(rawNorm)) return 82;
  if (stripped.length >= 6 && renderedNorm.includes(stripped)) return 78;
  const rawPrefix = stripped.slice(0, Math.min(24, stripped.length));
  if (rawPrefix.length >= 8 && renderedNorm.includes(rawPrefix)) return 62;
  return 0;
}

export function resolveBodyLabel(runtime: TranslationRuntime, cell: NativeObjectHandle, message: Record<string, any>): NativeObjectHandle | null {
  if (!runtime.objc || typeof message.content !== 'string' || !message.content.trim()) return null;
  const contentView = nativeCall(runtime, cell, 'contentView') as NativeObjectHandle | null;
  if (!contentView) return null;
  const candidates: Array<{ label: NativeObjectHandle; score: number }> = [];
  for (const label of textViewsInView(runtime, contentView)) {
    if (!(runtime.objc.className(label) ?? '').includes('DCDReusableYYLabel')) continue;
    const rendered = textForView(runtime, label);
    if (!rendered) continue;
    const score = scoreRenderedTextCandidate(rendered, message.content);
    if (score > 0) candidates.push({ label, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.score < 60) return null;
  if (second && best.score - second.score < 15) return null;
  return best.label;
}
