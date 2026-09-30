import type { RawMessage } from '../core/controller';

export type PatchTarget = {
  owner: Record<string, any>;
  key: string;
  label: string;
};

function isRawMessage(value: unknown): value is RawMessage {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, any>;
  const channelId = record.channelId ?? record.channel_id;
  return typeof record.id === 'string'
    && typeof channelId === 'string'
    && typeof record.content === 'string';
}

export function findMessageInRenderArgs(args: unknown[]): RawMessage | null {
  const first = args[0] as Record<string, any> | undefined;
  const preferred = [
    first?.message,
    first?.rowData?.message,
    first?.item?.message,
    first?.data?.message,
    first?.messageRecord,
    first,
  ];
  for (const candidate of preferred) {
    if (isRawMessage(candidate)) return candidate;
  }
  return findMessageDeep(first, 0, new Set<object>());
}

function findMessageDeep(value: unknown, depth: number, seen: Set<object>): RawMessage | null {
  if (!value || typeof value !== 'object' || depth > 4) return null;
  if (isRawMessage(value)) return value;

  const object = value as Record<string, any>;
  if (seen.has(object)) return null;
  seen.add(object);

  if (Array.isArray(object)) {
    for (const child of object.slice(0, 12)) {
      const found = findMessageDeep(child, depth + 1, seen);
      if (found) return found;
    }
    return null;
  }

  const preferredKeys = ['message', 'rowData', 'item', 'data', 'record', 'payload', 'props'];
  for (const key of preferredKeys) {
    if (!(key in object)) continue;
    const found = findMessageDeep(object[key], depth + 1, seen);
    if (found) return found;
  }

  let scanned = 0;
  for (const key of Object.keys(object)) {
    if (preferredKeys.includes(key)) continue;
    if (key.startsWith('_') || key === 'children' || key === 'ref') continue;
    const child = object[key];
    if (!child || typeof child !== 'object') continue;
    const found = findMessageDeep(child, depth + 1, seen);
    if (found) return found;
    scanned += 1;
    if (scanned >= 16) break;
  }
  return null;
}

function targetFromValue(owner: Record<string, any>, key: string, value: any): PatchTarget | null {
  if (typeof value === 'function') return { owner, key, label: key };
  if (value && typeof value === 'object' && typeof value.type === 'function') {
    return { owner: value, key: 'type', label: key + '.type' };
  }
  return null;
}

export function resolveMessageWithContentPatchTarget(moduleExports: unknown): PatchTarget | null {
  if (!moduleExports || (typeof moduleExports !== 'object' && typeof moduleExports !== 'function')) return null;
  const module = moduleExports as Record<string, any>;

  for (const key of ['default', 'MessageWithContent']) {
    const target = targetFromValue(module, key, module[key]);
    if (target) return target;
  }

  for (const [key, value] of Object.entries(module)) {
    const functionName = typeof value === 'function'
      ? value.name
      : value && typeof value === 'object' && typeof value.type === 'function'
        ? value.type.name
        : '';
    if (!/MessageWithContent/i.test(key + ' ' + functionName)) continue;
    const target = targetFromValue(module, key, value);
    if (target) return target;
  }

  const candidates = Object.entries(module)
    .map(([key, value]) => targetFromValue(module, key, value))
    .filter((value): value is PatchTarget => Boolean(value));
  return candidates.length === 1 ? candidates[0] : null;
}
