<p align="center">
  <img src="assets/logo.svg" width="112" alt="watari logo: a covered corridor crossing a pond between two rooms">
</p>

<h1 align="center">watari 渡り</h1>

<p align="center">Data fetching for React and React Native: a middleware pipeline and a tag-based cache that lives in the store you already use.</p>

> **Work in progress.** `@watari/core` works and is tested; the React bindings, store adapters
> and middlewares are not written yet. Nothing is published to npm yet. See [Status](#status).

- **Middleware pipeline.** Every request goes through an onion of `(request, next) => response`
  functions. `next` can be called more than once, so retry and token refresh are just middleware.
- **Tag-based cache.** Queries are cached by a stable key, deduplicated while in flight, and
  marked stale when a mutation invalidates one of their tags.
- **Pluggable cache store.** The cache is a small `CacheStore` interface: in memory by default,
  or (planned) inside your Redux or Zustand store.
- **No dependencies.** The core works anywhere `fetch` exists: browsers, React Native, Node 18+.

## The name

_Watari_ (渡り) means "crossing", from _watari-rōka_ (渡り廊下), the covered corridor that
connects the rooms of a traditional Japanese house. Requests cross over to the server and
come back with data, carried to the room that needs it.

Watari is one part of a bigger house:

- **jubako** (重箱), the stacked lunch boxes kept in the kitchen. It stores things in layers.
- **watari** (渡り), the corridor. It fetches data and carries it where it is needed.
- [**koniwa**](https://github.com/dangttp97/koniwa) (小庭), the small garden. It puts
  everything on display.

_Jubako keeps things, watari carries them, koniwa shows them._

## Install

Not on npm yet. Once published:

```sh
yarn add @watari/core
```

The unscoped `watari` package on npm belongs to someone else: always install `@watari/*`.

## Quick start

```ts
import { createClient, type Middleware } from '@watari/core';

const withToken: Middleware = (request, next) =>
  next({
    ...request,
    headers: { ...request.headers, authorization: `Bearer ${getToken()}` },
  });

const api = createClient({
  baseUrl: 'https://api.example.com',
  timeoutMs: 10_000,
  middlewares: [withToken],
});

// Plain request: no cache.
const health = await api.request<{ ok: boolean }>({
  method: 'GET',
  url: '/health',
});

// Cached query: fresh for 30 s, deduplicated while in flight, tagged for invalidation.
const todos = await api.query<Todo[]>({
  method: 'GET',
  url: '/todos',
  query: { done: false },
  staleTime: 30_000,
  tags: ['todos'],
});

// Mutation: never cached; invalidates every query tagged 'todos'.
await api.mutate({
  method: 'POST',
  url: '/todos',
  body: { title: 'Buy tea' },
  invalidates: ['todos'],
});
```

## Client

`createClient(config)` takes:

| Option        | Default   | Description                                                      |
| ------------- | --------- | ---------------------------------------------------------------- |
| `baseUrl`     |           | Prefixed to relative `url`s.                                     |
| `headers`     |           | Sent with every request; per-request headers win.                |
| `timeoutMs`   | `60000`   | Per request; can be overridden per call.                         |
| `middlewares` | `[]`      | Run in order, outermost first.                                   |
| `transport`   | `fetch`   | The function that actually sends the request.                    |
| `store`       | in-memory | Where cache entries live (`CacheStore`).                         |
| `keyHeaders`  | `[]`      | Headers that are part of the cache key (e.g. `accept-language`). |
| `debug`       | dev mode  | Enables development warnings.                                    |

and returns:

| Method                 | Description                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `request(options)`     | Runs the pipeline and parses the response. No cache.                          |
| `query(options)`       | Returns cached data while fresh, otherwise fetches (deduplicated) and caches. |
| `mutate(options)`      | Runs a request, then invalidates the tags in `invalidates`.                   |
| `observe(options)`     | A `{ getSnapshot, subscribe, refetch }` object for UI bindings.               |
| `invalidateTags(tags)` | Marks matching entries stale and returns their keys.                          |
| `getQueryKey(options)` | The cache key of a query.                                                     |
| `clear()`              | Drops all cached data and in-flight requests; subscribers stay attached.      |

Request options: `method`, `url`, `query`, `headers`, `body` (JSON, `FormData`, `Blob`,
`ArrayBuffer`, `URLSearchParams`), `signal`, `timeoutMs`, and `responseType`
(`'json'` | `'text'` | `'raw'`). Queries add `name`, `staleTime` (default `0`) and `tags`.

A query whose body can't be serialized (e.g. `FormData`) has no stable key, so it skips the
cache and deduplication and runs as a plain request.

## Errors

Watari only reports protocol failures. Every error is a `WatariError` with a `code`:

| Code      | When                                                         |
| --------- | ------------------------------------------------------------ |
| `HTTP`    | Non-2xx status. `HttpError` has `status`, `body`, `headers`. |
| `TIMEOUT` | `timeoutMs` elapsed.                                         |
| `ABORTED` | The caller's `signal` aborted.                               |
| `NETWORK` | The transport failed (offline, DNS, CORS, ...).              |
| `PARSE`   | The body didn't match `responseType`.                        |

```ts
import { isWatariError } from '@watari/core';

try {
  await api.query({ method: 'GET', url: '/me' });
} catch (e) {
  if (isWatariError(e) && e.code === 'TIMEOUT') showRetry();
}
```

Domain errors (validation, business rules) belong to your app: map them in a middleware.

## Status

| Package               | Status  | Contents                                          |
| --------------------- | ------- | ------------------------------------------------- |
| `@watari/core`        | Working | Client, transport, pipeline, cache, query, errors |
| `@watari/react`       | Planned | `useQuery`, `useMutation`, `defineApi`            |
| `@watari/redux`       | Planned | Redux-backed `CacheStore`                         |
| `@watari/zustand`     | Planned | Zustand-backed `CacheStore`                       |
| `@watari/middlewares` | Planned | `auth401` (single-flight token refresh), `logger` |

Later: persistence (`@watari/persist`), React Native focus/online refetch, schema validation,
optimistic updates. Deliberately out of scope: normalized cache, GraphQL, a UI kit.
The full plan is in [docs/ROADMAP.md](docs/ROADMAP.md), the design in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

Yarn 4 monorepo, Node 22.

```sh
yarn install
yarn test
yarn typecheck && yarn lint
yarn build                  # builds all @watari/* packages
yarn example:web dev        # Vite + React example
yarn example:native start   # Expo example
```

The examples import `@watari/*` straight from TypeScript sources, so no build is needed while
developing.

## License

MIT
