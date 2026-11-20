# Architecture

Core rule: **no nested wrappers**. A request passes through layers in sequence; each layer is one function with a clear input and output, living in its own folder. `fetch` is called in exactly one place: `transport/fetch.ts`.

## Request lifecycle

```
client.query(key, params)            (client.request() skips ① and ⑤)
  │
  ① query/      Decide whether to fetch: fresh cache → return it; same key in flight → share the promise
  ② pipelines/  compose(middlewares, transport): onion middleware chain
  │              [logger → auth401 → retry] → transport
  ③ transport/  The ONLY place that calls fetch: build URL + query, encode body,
  │              combine timeout + caller signal; map failures to NetworkError / TimeoutError / AbortedError
  ④ response/   Status check → HttpError; parse (204/empty → undefined, bad JSON → ParseError)
  ⑤ cache/      QueryCache writes to the CacheStore only with a valid ticket; the store notifies subscribers
  ⑥ react       useQuery re-reads the snapshot via useSyncExternalStore
```

## `@watari/core` layout

```
packages/core/src/
  client.ts                 createClient: wiring only
  transport/
    types.ts                HttpMethod, RequestHeaders, QueryParams, RequestBody, TransportRequest/Response, Transport
    url.ts                  joinUrl, appendQuery
    encode-body.ts          plain object/array → JSON + Content-Type; FormData/Blob/... passed through
    request-signal.ts       combine caller signal + timeout, remember why it aborted
    fetch.ts                fetchTransport: the only fetch call, error mapping
  pipelines/
    types.ts                Middleware, NextFn (= Transport)
    compose-middlewares.ts  compose(middlewares, transport) → Transport
    retry.ts                built-in retry middleware
  response/
    types.ts                ResponseFormat = 'json' | 'text' | 'raw'
    handle-response.ts      status check + parsing
  errors/                   WatariError (+ code), HttpError, TimeoutError, AbortedError, NetworkError, ParseError
  cache/
    types.ts                CacheEntry, CacheStore, FetchTicket
    key.ts                  createCacheKey(name, params) with stable (sorted) stringify
    memory-store.ts         default CacheStore
    query-cache.ts          the rules: freshness, tickets, tags, invalidate, restore, clear
  query/                    (next) runQuery, inflight, observe
  mutation/                 (next) runMutation
  index.ts
```

## Contracts

```ts
type Transport  = (request: TransportRequest) => Promise<TransportResponse>;
type NextFn     = Transport;
type Middleware = (request: TransportRequest, next: NextFn) => Promise<TransportResponse>;
type Plugin     = (client: Client) => () => void;   // returns cleanup

interface TransportResponse {         // minimal on purpose: a native transport can implement it
  status: number;
  statusText: string;
  url: string;
  headers: RequestHeaders;            // lower-cased keys
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface CacheStore {                // synchronous reads for useSyncExternalStore
  get<T = unknown>(key: string): CacheEntry<T> | undefined;
  set<T = unknown>(key: string, entry: CacheEntry<T>): void;
  delete(key: string): void;
  keys(): string[];
  subscribe(key: string, callback: () => void): () => void;   // returns unsubscribe
}
```

Four extension points — core knows nothing about React Native, Redux or jubako:

| Extension point | Examples |
|---|---|
| `transport` | `fetchTransport` (default), `@watari/native` (OkHttp / URLSession) |
| `middlewares` | `retry`, `auth401`, `logger`, app-specific error mapping |
| `store` | memory, `@watari/redux`, `@watari/zustand`, `withPersist(store, jubako)` |
| `plugins` | `refetchOnFocus(AppState)`, `onlineManager(NetInfo)` |

## Transport & pipeline notes

- `fetchTransport` must map a `Response` field by field (`text: () => response.text()`); spreading a `Response` loses its prototype getters and methods.
- At the pipeline level HTTP errors are not thrown yet: `retry` inspects `response.status`; only transport errors are thrown.
- Retry defaults: methods `GET`/`HEAD`/`OPTIONS`, statuses 408/429/5xx, errors `NetworkError`/`TimeoutError`; never `AbortedError`; backoff sleep is cancellable; after the last attempt the last response is returned so the response layer throws `HttpError`.
- Timeout is a request field, not a middleware; each retry attempt gets its own timeout.

## Errors

- `WatariError.code`: `HTTP` | `TIMEOUT` | `ABORTED` | `NETWORK` | `PARSE`. Set `name` to the class name and call `Object.setPrototypeOf(this, new.target.prototype)`.
- One `HttpError` with `status`, `body`, `headers` (no `Response`, so it stays serializable) and getters `isClientError`, `isServerError`, `isUnauthorized`, `isRateLimited`. No per-status subclasses.
- Domain errors (session expired, quota exceeded…) are defined by apps in a middleware.
- `ABORTED` is not a query failure: restore the previous cache state, never retry.

## Cache

Roles: **runQuery** coordinates, **QueryCache** guards writes, **CacheStore** stores and notifies, **the hook** subscribes and re-reads. Data flows one way; only QueryCache writes to the store.

```ts
type CacheEntry<T = unknown> = {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: T;
  error?: unknown;
  updatedAt?: number;             // last successful fetch
  tags?: readonly Tag[];          // kept in the entry so the tag index can be rebuilt after hydrate
  isInvalidated?: boolean;
};

type FetchTicket = { key: CacheKey; generation: number; previous: CacheEntry | undefined };
```

- **Freshness is computed on read** (`now - updatedAt < staleTime`, `status === 'success'`, not invalidated), never stored.
- **Tickets:** `markLoading(key)` issues a ticket from one global, ever-increasing counter and records it as the key's valid ticket. `setSuccess` / `setError` / `restore` only write if the ticket is still valid. `invalidate` and `clear` drop valid tickets, so in-flight responses are ignored. The counter is never reset.
- **Loading keeps previous data** (no flicker); `setError` also keeps data.
- **Invalidate ≠ delete:** it marks `isInvalidated` and keeps data; `invalidateTags` returns the affected keys so the query layer can refetch visible queries. Only `clear()` removes data, and it never removes subscribers.
- **Tag index** (`tag → keys`) lives in QueryCache memory, as do valid tickets: runtime bookkeeping, not data.
- The query layer's dedupe map must also drop the shared promise on invalidate (see `query/inflight.ts`).

### Cache keys

`createCacheKey(name, parts)` → `name:` + stable JSON (object keys sorted recursively, `undefined` dropped, array order kept).

- **Readable JSON keys everywhere** — memory and persisted storage, dev and production alike. No hashing, no dev/prod branching (tests must exercise the same path as production).
- What goes into the key: `name` (defaults to `METHOD url`), `query`, `body`, and only the headers listed in `keyHeaders` (default none — `Authorization`, request ids and middleware-added headers would break dedupe and caching).
- Non-serializable bodies (`FormData`, `Blob`, `ArrayBuffer`) get no key: the query bypasses cache and dedupe (dev warning). Mutations never dedupe.
- **Why not hash keys?** Considered and rejected (Nov 2026): hashing only hides the key while the persisted entry still holds the response data in plain text, and one-way hashes make hydrate unable to restore original keys or rebuild the tag index. Sensitive data is protected by **encrypting the storage** (MMKV `encryptionKey`, jubako `secure` layer). Revisit only if a storage backend imposes a key-length limit — it is a one-function change.

### Flows

| Scenario | Store entry over time |
|---|---|
| First load | — → `loading` → `success` |
| Fresh hit | unchanged; no ticket, no pipeline |
| Stale (SWR) | `success(old)` → `loading(old)` → `success(new)` |
| Mutation → `invalidateTags` | `success(old, invalidated)` → `loading(old)` → `success(new)` |
| Invalidate mid-flight | `loading` → `loading, invalidated`; old response ignored; refetch with a new ticket |
| Abort | `loading` → previous entry restored (or deleted if none) |
| `clear()` (logout) | all deleted, subscribers notified and kept |

## Packages

```
@watari/core          everything above, zero dependencies
@watari/react         useQuery, useMutation, defineApi
@watari/redux         Redux CacheStore
@watari/zustand       Zustand CacheStore
@watari/middlewares   auth401, logger
@watari/persist       (v1.x) withPersist for jubako / AsyncStorage
@watari/react-native  (v1.x) refetchOnFocus, onlineManager
@watari/native        (later) native transport, hand-written by the author
```
