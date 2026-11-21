import { createMemoryStore } from './cache/memory-store';
import { createQueryCache, type QueryCache } from './cache/query-cache';
import type { CacheKey, CacheStore, Tag } from './cache/types';
import { isDev } from './is-dev';
import type { MutationOptions } from './mutation/types';
import { compose } from './pipelines/compose-middlewares';
import type { Middleware } from './pipelines/types';
import { buildQueryKey } from './query/build-query-key';
import { createInflight } from './query/inflight';
import { runQuery } from './query/run-query';
import { handleResponse } from './response/handle-response';
import type { ResponseFormat } from './response/types';
import { fetchTransport } from './transport/fetch';
import type {
  RequestHeaders,
  Transport,
  TransportRequest,
} from './transport/types';

const DEFAULT_TIMEOUT = 60_000;

export type ClientConfig = {
  baseUrl?: string;
  headers?: RequestHeaders;
  timeoutMs?: number;
  middlewares?: Middleware[];
  transport?: Transport;
  /** Where query results are stored. Defaults to an in-memory store. */
  store?: CacheStore;
  /** Request headers that change the response and must be part of the cache key (e.g. 'accept-language'). */
  keyHeaders?: readonly string[];
  /**
   * Enables development warnings. Defaults to auto-detection (`__DEV__` on React Native,
   * `NODE_ENV !== 'production'` elsewhere). Pass your own flag when the app decides
   * its environment differently, e.g. `debug: Config.ENV !== 'production'` with react-native-config.
   */
  debug?: boolean;
};

export type RequestOptions = Omit<TransportRequest, 'baseUrl'> & {
  responseType?: ResponseFormat;
};

export type QueryOptions = RequestOptions & {
  /** Readable cache key prefix. Defaults to `METHOD url`. */
  name?: string;
  /** How long (ms) a successful result is considered fresh. Default 0. */
  staleTime?: number;
  tags?: readonly Tag[];
};

export type Client = {
  request: <T = unknown>(options: RequestOptions) => Promise<T>;
  query: <T = unknown>(options: QueryOptions) => Promise<T>;
  mutate: <T = unknown>(options: MutationOptions) => Promise<T>;
  invalidateTags: (tags: readonly Tag[]) => CacheKey[];
  clear: () => void;
  cache: QueryCache;
};

export const createClient = (config: ClientConfig = {}): Client => {
  const run = compose(
    config.middlewares ?? [],
    config.transport ?? fetchTransport()
  );
  const cache = createQueryCache(config.store ?? createMemoryStore());
  const inflight = createInflight();
  const keyHeaders = (config.keyHeaders ?? []).map((h) => h.toLowerCase());
  const debug = config.debug ?? isDev();

  const request = async <T = unknown>({
    responseType,
    ...req
  }: RequestOptions): Promise<T> => {
    const res = await run({
      ...req,
      baseUrl: config.baseUrl,
      headers: { ...config.headers, ...req.headers },
      timeoutMs: req.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT,
    });
    return handleResponse<T>(res, responseType);
  };

  const query = <T = unknown>({
    name,
    staleTime,
    tags,
    signal,
    ...req
  }: QueryOptions): Promise<T> => {
    const key = buildQueryKey(
      { ...req, headers: { ...config.headers, ...req.headers } },
      name,
      keyHeaders
    );

    if (key === undefined) {
      if (debug) {
        console.warn(
          `[watari] query "${name ?? `${req.method} ${req.url}`}" has a non-serializable body; cache and dedupe are skipped.`
        );
      }
      return request<T>({ ...req, signal });
    }

    return runQuery<T>(
      { cache, inflight },
      {
        key,
        staleTime,
        tags,
        signal, // the caller's signal: only stops this caller from waiting
        fetcher: (sharedSignal) => request<T>({ ...req, signal: sharedSignal }),
      }
    );
  };

  const invalidateTags = (tags: readonly Tag[]) => {
    const keys = cache.invalidateTags(tags);
    keys.forEach(inflight.forget);
    return keys;
  };

  const mutate = async <T = unknown>({
    invalidates,
    ...req
  }: MutationOptions): Promise<T> => {
    const data = await request<T>(req);

    if (invalidates?.length) invalidateTags(invalidates);

    return data;
  };

  const clear = () => {
    inflight.clear();
    cache.clearAll();
  };

  return { request, query, mutate, invalidateTags, clear, cache };
};
