import type { RequestSignal } from './types';

export const createRequestSignal = (
  userSignal?: AbortSignal,
  timeoutMs?: number
): RequestSignal => {
  const controller = new AbortController();
  let timedOut = false;

  const onUserAbort = () => controller.abort();

  if (userSignal?.aborted) {
    controller.abort();
  } else {
    userSignal?.addEventListener('abort', onUserAbort, { once: true });
  }

  const timer = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;

  return {
    signal: controller.signal,
    reason: () => {
      if (timedOut) {
        return 'timeout';
      }
      if (userSignal?.aborted) {
        return 'user-aborted';
      }
      return undefined;
    },
    cleanupFn: () => {
      timer && clearTimeout(timer);
      userSignal?.removeEventListener('abort', onUserAbort);
    },
  };
};
