import { expect, test } from '@jest/globals';

import { buildQueryKey } from '../build-query-key';

test('without a name the key starts with METHOD url', () => {
  expect(buildQueryKey({ method: 'GET', url: '/todos' })).toMatch(
    /^GET \/todos/
  );
});

test('different urls without a name give different keys', () => {
  expect(buildQueryKey({ method: 'GET', url: '/todos' })).not.toBe(
    buildQueryKey({ method: 'GET', url: '/users' })
  );
});

test('body field order does not change the key', () => {
  const a = buildQueryKey({
    method: 'POST',
    url: '/s',
    body: { q: 'a', page: 1 },
  });
  const b = buildQueryKey({
    method: 'POST',
    url: '/s',
    body: { page: 1, q: 'a' },
  });
  expect(a).toBe(b);
});

test('different bodies give different keys', () => {
  const a = buildQueryKey({ method: 'POST', url: '/s', body: { q: 'a' } });
  const b = buildQueryKey({ method: 'POST', url: '/s', body: { q: 'b' } });
  expect(a).not.toBe(b);
});

test('only keyHeaders affect the key', () => {
  const base = { method: 'GET' as const, url: '/x' };
  const a = buildQueryKey(
    { ...base, headers: { 'X-Request-Id': '1', 'Accept-Language': 'vi' } },
    undefined,
    ['accept-language']
  );
  const b = buildQueryKey(
    { ...base, headers: { 'X-Request-Id': '2', 'Accept-Language': 'vi' } },
    undefined,
    ['accept-language']
  );
  const c = buildQueryKey(
    { ...base, headers: { 'Accept-Language': 'ja' } },
    undefined,
    ['accept-language']
  );
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test('non-serializable body → undefined', () => {
  expect(
    buildQueryKey({ method: 'POST', url: '/u', body: new FormData() })
  ).toBeUndefined();
  expect(
    buildQueryKey({ method: 'POST', url: '/u', body: new Blob(['x']) })
  ).toBeUndefined();
});
