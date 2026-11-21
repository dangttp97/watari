import { describe, expect, jest, test } from '@jest/globals';

import { deferred } from '../__fixtures__/deferred';
import { fakeResponse } from '../__fixtures__/fake-response';
import { createClient } from '../client';
import { HttpError } from '../errors/HttpError';
import { buildQueryKey } from '../query/build-query-key';
import type { Transport, TransportResponse } from '../transport/types';

/**
 * Fake backend: GET /todos returns the current list, POST /todos adds an item.
 * `failNextPost` makes the next POST answer 500.
 */
const createFakeBackend = () => {
  const todos: string[] = ['a'];
  let failNextPost = false;

  const transport = jest.fn<Transport>(async (req) => {
    if (req.method === 'GET' && req.url === '/todos') {
      return fakeResponse(200, [...todos]);
    }
    if (req.method === 'POST' && req.url === '/todos') {
      if (failNextPost) {
        failNextPost = false;
        return fakeResponse(500, { message: 'boom' });
      }
      todos.push((req.body as { title: string }).title);
      return fakeResponse(201, { ok: true });
    }
    return fakeResponse(404);
  });

  return {
    transport,
    failNextPost: () => {
      failNextPost = true;
    },
    getCalls: () =>
      transport.mock.calls.map(([req]) => `${req.method} ${req.url}`),
  };
};

const todosQuery = {
  name: 'todos',
  method: 'GET' as const,
  url: '/todos',
  staleTime: 60_000,
  tags: ['todos'],
};

const addTodo = (title: string) => ({
  method: 'POST' as const,
  url: '/todos',
  body: { title },
  invalidates: ['todos'],
});

describe('mutate', () => {
  test('success invalidates the tags, so the next query refetches fresh data', async () => {
    const backend = createFakeBackend();
    const client = createClient({ transport: backend.transport });
    await client.query(todosQuery);
    await client.mutate(addTodo('b'));

    const key = buildQueryKey(todosQuery, todosQuery.name)!;
    expect(client.cache.getCache(key)).toMatchObject({
      data: ['a'],
      invalidated: true,
    });
    await expect(client.query(todosQuery)).resolves.toEqual(['a', 'b']);
    expect(backend.getCalls()).toEqual([
      'GET /todos',
      'POST /todos',
      'GET /todos',
    ]);
  });

  test('failure (500) throws HttpError and does NOT invalidate', async () => {
    const backend = createFakeBackend();
    const client = createClient({ transport: backend.transport });
    await client.query(todosQuery);
    backend.failNextPost();

    await expect(client.mutate(addTodo('b'))).rejects.toBeInstanceOf(HttpError);
    await expect(client.query(todosQuery)).resolves.toEqual(['a']);

    expect(backend.getCalls()).toEqual(['GET /todos', 'POST /todos']);
  });

  test('two concurrent mutations send two requests (no dedupe)', async () => {
    const backend = createFakeBackend();
    const client = createClient({ transport: backend.transport });

    await Promise.all([
      client.mutate(addTodo('b')),
      client.mutate(addTodo('b')),
    ]);

    expect(backend.getCalls()).toEqual(['POST /todos', 'POST /todos']);
  });

  test('mutate returns the parsed response body', async () => {
    const backend = createFakeBackend();
    const client = createClient({ transport: backend.transport });

    await expect(client.mutate(addTodo('b'))).resolves.toEqual({ ok: true });
  });

  test('mutate does not write anything into the cache', async () => {
    const backend = createFakeBackend();
    const client = createClient({ transport: backend.transport });

    await client.mutate({ ...addTodo('b'), invalidates: undefined });

    expect(client.invalidateTags(['todos'])).toEqual([]);
  });

  test('a mutation finishing while the list query is in flight makes that response stale', async () => {
    const slowGet = deferred<TransportResponse>();
    const transport = jest
      .fn<Transport>()
      .mockReturnValueOnce(slowGet.promise)
      .mockResolvedValueOnce(fakeResponse(201, { ok: true }))
      .mockResolvedValueOnce(fakeResponse(200, ['a', 'b']));
    const client = createClient({ transport });

    const firstLoad = client.query(todosQuery);
    await client.mutate(addTodo('b'));
    slowGet.resolve(fakeResponse(200, ['a']));
    await firstLoad;

    await expect(client.query(todosQuery)).resolves.toEqual(['a', 'b']);
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
