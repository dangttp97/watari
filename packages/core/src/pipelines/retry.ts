/* ====== Retry middleware ======
 *
 * Considering this as an example for building a middleware
 *
 */

import { AbortedError } from '../errors/AbortedError';
import { NetworkError } from '../errors/NetworkError';
import { TimeoutError } from '../errors/TimeoutError';
import type { HttpMethod } from '../transport/types';
import type { Middleware } from './types';

type RetryMiddlewareOptions = {
  retries?: number;
  delay?: (attempt: number) => number;
  methods?: readonly HttpMethod[];
  retryOnStatus?: (status: number) => boolean;
  retryOnError?: (error: unknown) => boolean;
};

const defaultRetryOnStatus = (s: number) => s === 400 || s === 429 || s >= 500;
const defaultRetryOnError = (e: unknown) =>
  e instanceof NetworkError || e instanceof TimeoutError;

const sleepFn = (sleepMs: number, signal?: AbortSignal) => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new AbortedError());
    }

    const timer = setTimeout(resolve, sleepMs);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AbortedError());
      },
      { once: true }
    );
  });
};

export const retry =
  (props: RetryMiddlewareOptions): Middleware =>
  async (request, nextFn) => {
    const {
      retries = 2,
      delay = (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      methods = ['GET', 'HEAD', 'OPTIONS'],
      retryOnStatus = defaultRetryOnStatus,
      retryOnError = defaultRetryOnError,
    } = props;

    if (!methods.includes(request.method)) return nextFn(request);

    for (let attempt = 0; ; attempt++) {
      try {
        const response = await nextFn(request);
        if (attempt >= retries || !retryOnStatus(response.status))
          return response;
      } catch (e) {
        if (attempt >= retries || !retryOnError(e)) throw e;
      }

      await sleepFn(delay(attempt), request.signal);
    }
  };
