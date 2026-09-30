import { metro, patcher } from '@unbound-app/api';
import type { RawMessage, TranslationController } from '../core/controller';
import TranslationInline from '../ui/TranslationInline';
import { findMessageInRenderArgs, resolveMessageWithContentPatchTarget } from './inline-helpers';

const Patcher = patcher.createPatcher('unbound.translate.inline');
const MESSAGE_CONTENT_PATH = 'modules/messages/native/renderer/MessageWithContent.tsx';
const MAX_INSTALL_ATTEMPTS = 24;

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let installed = false;

function wrapResult(result: unknown, controller: TranslationController, message: RawMessage): unknown {
  if (result === null || result === undefined || result === false) return result;
  const React = metro.common.React;
  const messageId = typeof message.id === 'string' ? message.id : 'unknown';
  return React.createElement(
    React.Fragment,
    null,
    result,
    React.createElement(TranslationInline, {
      key: 'unbound-translation-' + messageId,
      controller,
      message,
    }),
  );
}

function tryInstall(controller: TranslationController, attempt: number): void {
  if (stopped || installed) return;

  let moduleExports: unknown = null;
  try {
    moduleExports = metro.findByFilePath(MESSAGE_CONTENT_PATH, {
      interop: false,
      initialize: true,
      cache: attempt > 0,
    });
  } catch {}

  const target = resolveMessageWithContentPatchTarget(moduleExports);
  if (!target) {
    if (attempt >= MAX_INSTALL_ATTEMPTS) return;
    retryTimer = setTimeout(() => tryInstall(controller, attempt + 1), 250);
    return;
  }

  Patcher.after(target.owner, target.key, ({ args, result }: { args: unknown[]; result: unknown }) => {
    try {
      const message = findMessageInRenderArgs(args);
      if (!message || typeof message.content !== 'string' || !message.content.trim()) return result;
      return wrapResult(result, controller, message);
    } catch {
      return result;
    }
  });

  installed = true;
}

export function isInlineRendererInstalled(): boolean {
  return installed;
}

export function startInlineRenderer(controller: TranslationController): void {
  stopInlineRenderer();
  stopped = false;
  tryInstall(controller, 0);
}

export function stopInlineRenderer(): void {
  stopped = true;
  installed = false;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  Patcher.unpatchAll();
}
