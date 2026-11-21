import { createCacheKey } from '../cache/key';
import type { CacheKey } from '../cache/types';
import type { TransportRequest } from '../transport/types';

const isSerializableBody = (body: unknown) =>
  !(typeof FormData !== 'undefined' && body instanceof FormData) &&
  !(typeof Blob !== 'undefined' && body instanceof Blob) &&
  !(body instanceof ArrayBuffer);

/**
 * Builds the cache/dedupe key of a query request.
 * Returns undefined when the request can't be keyed (non-serializable body).
 * `keyHeaders` must be lower-cased.
 */
export const buildQueryKey = (
  request: Pick<
    TransportRequest,
    'method' | 'url' | 'query' | 'body' | 'headers'
  >,
  name?: string,
  keyHeaders: readonly string[] = []
): CacheKey | undefined => {
  if (!isSerializableBody(request.body)) return undefined;

  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).filter(([h]) =>
      keyHeaders.includes(h.toLowerCase())
    )
  );

  return createCacheKey(name ?? `${request.method} ${request.url}`, {
    query: request.query,
    body: request.body,
    headers: Object.keys(headers).length ? headers : undefined,
  });
};
