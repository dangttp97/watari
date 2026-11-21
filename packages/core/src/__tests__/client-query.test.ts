import { expect, jest, test } from '@jest/globals';

import { deferred } from '../__fixtures__/deferred';
import { fakeResponse } from '../__fixtures__/fake-response';
import { createClient } from '../client';
import type { Transport, TransportResponse } from '../transport/types';

test('two urls without a name are cached separately', async () => {
  const transport = jest.fn<Transport>(async (req) =>
    fakeResponse(200, { url: req.url })
  );
  const client = createClient({ transport });

  const [todos, users] = await Promise.all([
    client.query({ method: 'GET', url: '/todos' }),
    client.query({ method: 'GET', url: '/users' }),
  ]);

  expect(todos).toEqual({ url: '/todos' });
  expect(users).toEqual({ url: '/users' });
  expect(transport).toHaveBeenCalledTimes(2);
});

test('same query called three times at once → one request', async () => {
  const transport = jest.fn<Transport>(async () =>
    fakeResponse(200, { ok: true })
  );
  const client = createClient({ transport });
  const q = { name: 'todo', method: 'GET' as const, url: '/todos/1' };

  await Promise.all([client.query(q), client.query(q), client.query(q)]);

  expect(transport).toHaveBeenCalledTimes(1);
});

test('invalidateTags mid-flight → the old response is ignored and the next query refetches', async () => {
  const first = deferred<TransportResponse>();
  const transport = jest
    .fn<Transport>()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(fakeResponse(200, { v: 2 }));
  const client = createClient({ transport });
  const q = {
    name: 'todos',
    method: 'GET' as const,
    url: '/todos',
    staleTime: 60_000,
    tags: ['todos'],
  };

  const old = client.query(q);
  await Promise.resolve();
  client.invalidateTags(['todos']);
  first.resolve(fakeResponse(200, { v: 1 }));
  await old;

  await expect(client.query(q)).resolves.toEqual({ v: 2 });
  expect(transport).toHaveBeenCalledTimes(2);
});

test('non-serializable body skips cache and dedupe', async () => {
  const transport = jest.fn<Transport>(async () =>
    fakeResponse(200, { ok: true })
  );
  const client = createClient({ transport });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const q = { method: 'POST' as const, url: '/upload', body: new FormData() };

  await Promise.all([client.query(q), client.query(q)]);

  expect(transport).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test('debug: false silences development warnings', async () => {
  const transport = jest.fn<Transport>(async () => fakeResponse(200, {}));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  await createClient({ transport, debug: false }).query({
    method: 'POST',
    url: '/u',
    body: new FormData(),
  });
  expect(warn).not.toHaveBeenCalled();

  await createClient({ transport, debug: true }).query({
    method: 'POST',
    url: '/u',
    body: new FormData(),
  });
  expect(warn).toHaveBeenCalledTimes(1);

  warn.mockRestore();
});
