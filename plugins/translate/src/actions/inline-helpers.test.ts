import { describe, expect, test } from 'bun:test';
import { findMessageInRenderArgs, resolveMessageWithContentPatchTarget } from './inline-helpers';

const message = { id: 'm1', channel_id: 'c1', content: 'hello' };

describe('inline renderer helpers', () => {
  test('prefers direct message props', () => {
    expect(findMessageInRenderArgs([{ message, quoted: { id: 'q', channel_id: 'c1', content: 'quoted' } }])).toBe(message);
  });

  test('finds a nested rowData message', () => {
    expect(findMessageInRenderArgs([{ rowData: { message } }])).toBe(message);
  });

  test('rejects unrelated render props', () => {
    expect(findMessageInRenderArgs([{ channelId: 'c1', text: 'hello' }])).toBeNull();
  });

  test('resolves default function exports', () => {
    const fn = () => null;
    const target = resolveMessageWithContentPatchTarget({ default: fn });
    expect(target?.key).toBe('default');
    expect(target?.owner.default).toBe(fn);
  });

  test('resolves memo-style exports', () => {
    const inner = () => null;
    const memo = { type: inner };
    const target = resolveMessageWithContentPatchTarget({ default: memo });
    expect(target?.owner).toBe(memo);
    expect(target?.key).toBe('type');
  });

  test('resolves named MessageWithContent exports', () => {
    const fn = function MessageWithContent() { return null; };
    const target = resolveMessageWithContentPatchTarget({ helper: 1, MessageWithContent: fn });
    expect(target?.key).toBe('MessageWithContent');
  });
});
