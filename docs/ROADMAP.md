# Roadmap & design decisions

Decisions taken during review sessions (Nov 2026). `rexios` (the predecessor, written ~Dec 2025 with heavy AI autocomplete) is reference material only.

## Branding

| Brand | Scope | Purpose |
|---|---|---|
| **watari** (渡り, "crossing") | `@watari/*` | Network: requests cross to the server and back. This repo. |
| **jubako** (重箱, stacked lacquer boxes) | `@jubako/*` | Storage toolkit: each tier of the box is a storage layer. Separate repo. |

- npm orgs `watari` and `jubako` are registered. The unscoped `watari` package on npm belongs to someone else: install instructions must always use the scope.
- Once watari is published: `npm deprecate react-native-rexios "Moved to @watari/core"` and the same for every `@rexios/*` package.
- The two libraries do not depend on each other. Integration lives in `@watari/persist`, which accepts anything with `getItem/setItem` (jubako, AsyncStorage, MMKV…).

## Positioning

Not novel on its own (urql exchanges, Apollo Link, RTK Query `baseQuery`, TanStack Query + ky cover similar ground). The differentiators:
1. **Pluggable cache store** — the cache lives in the store the app already uses (Redux, Zustand, memory).
2. **React Native first** — focus refetch via `AppState`, offline handling via `NetInfo`, persistence via MMKV/AsyncStorage, as small opt-in plugins.

Deliberately out of scope: normalized cache, GraphQL, infinite queries in core, a UI kit.

Principle: **small core, four extension points** — transport, middleware, store, plugin (see ARCHITECTURE).

## Decisions

- Middleware is an onion `(request, next) => Promise<TransportResponse>`. `next` may be called more than once (retry, auth refresh).
- **No compatibility adapter** for rexios' `{ before, after, onError }` middleware shape — removed outright (no real users yet).
- `defineApi` ships in **v1.0**, built last, on top of `useQuery` / `useMutation`.
- Library errors cover protocol failures only (`HTTP`, `TIMEOUT`, `ABORTED`, `NETWORK`, `PARSE`). One `HttpError` with `status` + getters; no per-status subclasses. Domain errors are defined by apps in a middleware.
- Transport is pluggable; the pipeline depends only on `TransportResponse`, so a native transport can plug in later.

## v1.0 — required before promoting

1. **Request client** ✅ transport, pipeline (`compose`, `retry`), response handling, errors, `client.request()`.
2. **Cache** (in progress): stable keys, memory store, `QueryCache` (ticket/generation, keep previous data while loading, invalidate ≠ delete, tag index, `restore` on abort, `clear` keeps subscribers).
3. **Query / mutation layer**: `runQuery` (fresh → dedupe → fetch → write), `inflight` (invalidate drops the shared promise), `runMutation` (no cache write, invalidates tags), stale-while-revalidate.
4. **`@watari/react`**: `useQuery` / `useMutation` via `useSyncExternalStore`, auto-abort on unmount.
5. **Adapters**: `@watari/redux`, `@watari/zustand` passing the shared CacheStore contract test.
6. **Middlewares**: `auth401` (single-flight refresh, retry once, `onRefreshFailed` only when refresh itself fails, called once), `logger`.
7. **`defineApi`**: typed endpoint definitions that generate hooks.
8. **Port rexios' `known-issues` tests** as an acceptance checklist.
9. **Packaging**: publish workflow for scoped packages, CommonJS + ESM builds, README with honest comparison table.

## v1.x

- Schema validation via Standard Schema (zod / valibot / arktype).
- `@watari/persist`: `withPersist(store, adapter)`, rebuilds the tag index on hydrate.
- `@watari/react-native`: `refetchOnFocus(AppState)`, `onlineManager(NetInfo)`, `refetchInterval`.
- Optimistic updates with automatic rollback.
- `client.on('request' | 'response' | 'cache')` for devtools / logging.
- Garbage collection of unused entries (`cacheTime`, computed from `updatedAt`).

## Later: `@watari/native` (hand-written by the author)

Native transport: Android on OkHttp (a thin layer — Retrofit needs compile-time interfaces, which does not fit dynamic requests from JS), iOS on `URLSession`. Turbo Module + Expo config plugin.
RN `fetch` already uses OkHttp / NSURLSession, so it must justify itself with what `fetch` lacks: SSL pinning / mTLS, upload & download progress, background transfers, cookie / connection-pool / HTTP cache control, large binary payloads without base64.

## jubako (separate repo)

- `@jubako/core`: tiered storage `jubako({ layers: [memory(), mmkv(storage), secureStore()], namespace, ttl, version, migrate })`.
- `@jubako/mmkv`, `@jubako/async-storage`: wrappers around existing engines.
- `@jubako/secure` (native Swift + Kotlin, after the others):
  - iOS: Face ID / Touch ID prompt is system UI only (reason, fallback, cancel text). Expose `SecAccessControl` flags, reuse duration, biometry-change detection.
  - Android: `BiometricPrompt` by default; opt-in `prompt: 'custom'` using the deprecated `FingerprintManager` + `CryptoObject` for an app-drawn fingerprint dialog (fingerprint only; document the limits).
  - Custom UI around the prompt: pre-prompt screen, app PIN-pad fallback, unified error codes.

## Launch checklist

- One-sentence pitch, 10-line quickstart, honest comparison vs TanStack Query / RTK Query, bundle-size badge, Expo Snack demo.
- Dogfood in a real app before promoting.
- Design write-up (Viblo, dev.to), r/reactnative, This Week in React.
