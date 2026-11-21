import { createMemoryStore } from './cache/memory-store';
import { createQueryCache, type QueryCache } from './cache/query-cache';
import type { CacheKey, CacheStore, Tag } from './cache/types';
import { isDev } from './is-dev';
import type { MutationOptions } from './mutation/types';
import { createQueryObserver } from './observer/create-query-observer';
import type { QueryObserver } from './observer/types';
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
  store?: CacheStore;
  keyHeaders?: readonly string[];
  debug?: boolean;
};

export type RequestOptions = Omit<TransportRequest, 'baseUrl'> & {
  responseType?: ResponseFormat;
};

export type QueryOptions = RequestOptions & {
  name?: string;
  staleTime?: number;
  tags?: readonly Tag[];
};

export type Client = {
  request: <T = unknown>(options: RequestOptions) => Promise<T>;
  query: <T = unknown>(options: QueryOptions) => Promise<T>;
  mutate: <T = unknown>(options: MutationOptions) => Promise<T>;
  observe: <T = unknown>(options: QueryOptions) => QueryObserver<T>;
  getQueryKey: (options: QueryOptions) => CacheKey | undefined;
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

  /** The cache key of a query, or undefined when its body is not serializable. */
  const getQueryKey = ({ name, ...req }: QueryOptions) =>
    buildQueryKey(
      { ...req, headers: { ...config.headers, ...req.headers } },
      name,
      keyHeaders
    );

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
    const key = getQueryKey({ name, ...req });

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
        signal,
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

  const observe = <T = unknown>(options: QueryOptions): QueryObserver<T> => {
    const key = getQueryKey(options);
    if (key === undefined) {
      throw new TypeError(
        `[watari] cannot observe "${options.name ?? `${options.method} ${options.url}`}": its body is not serializable. Use client.request() instead.`
      );
    }

    const fetchQuery = (signal: AbortSignal, force?: boolean) =>
      query<T>({
        ...options,
        signal,
        staleTime: force ? 0 : options.staleTime,
      });

    return createQueryObserver<T>(cache, key, fetchQuery, options.staleTime);
  };

  const clear = () => {
    inflight.clear();
    cache.clearAll();
  };

  return {
    request,
    query,
    mutate,
    observe,
    getQueryKey,
    invalidateTags,
    clear,
    cache,
  };
};
