import { AbortedError } from '../errors/AbortedError';
import { NetworkError } from '../errors/NetworkError';
import { TimeoutError } from '../errors/TimeoutError';
import { encodeBody } from './encode-body';
import { createRequestSignal } from './request-signal';
import type { Transport, TransportResponse } from './types';
import { appendQuery, joinUrl } from './url';

const convertToProperResponse = (response: Response): TransportResponse => {
  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers: Object.fromEntries(response.headers),
    text: () => response.text(),
    json: () => response.json(),
    arrayBuffer: () => response.arrayBuffer(),
  };
};

export const fetchTransport = (
  fetchFn: typeof fetch = globalThis.fetch
): Transport => {
  return async (ctx) => {
    const joinedUrl = joinUrl(ctx.baseUrl, ctx.url);
    const url = appendQuery(joinedUrl, ctx.query);
    const { body, headers } = encodeBody(ctx.body, ctx.headers);
    const req = createRequestSignal(ctx.signal, ctx.timeoutMs);

    try {
      const res = await fetchFn(url, {
        method: ctx.method,
        headers,
        body,
        signal: req.signal,
      });

      return convertToProperResponse(res);
    } catch (e) {
      const reason =
        typeof req.reason === 'function' ? req.reason() : req.reason;

      switch (reason) {
        case 'timeout':
          throw new TimeoutError(ctx.timeoutMs!, { cause: e });
        case 'user-aborted':
          throw new AbortedError({ cause: e });
        default:
          throw new NetworkError({ cause: e });
      }
    } finally {
      req.cleanupFn();
    }
  };
};
