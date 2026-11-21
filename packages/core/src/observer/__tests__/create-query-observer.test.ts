import { describe, expect, jest, test } from '@jest/globals';
import { deferred } from '../../__fixtures__/deferred';
import { fakeResponse } from '../../__fixtures__/fake-response';
import { createClient } from '../../client';
import type { Transport, TransportResponse } from '../../transport/types';

/**
 * The observer reacts asynchronously (promises, queueMicrotask).
 * `flush()` waits one macrotask, so every pending promise/microtask has run.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Fake server whose /todos response can be changed between calls. */
const createBackend = () => {
  let todos = ['a'];
  let status = 200;
  const transport = jest.fn<Transport>(async () =>
    fakeResponse(status, status === 200 ? todos : { message: 'boom' })
  );
  return {
    transport,
    setTodos: (next: string[]) => (todos = next),
    failWith: (next: number) => (status = next),
  };
};

const todosQuery = {
  name: 'todos',
  method: 'GET' as const,
  url: '/todos',
  tags: ['todos'],
};

describe('client.observe', () => {
  test('first subscriber with no data → fetches once and notifies', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });
    const observer = client.observe<string[]>(todosQuery);
    const onChange = jest.fn();

    observer.subscribe(onChange);
    await flush();

    expect(backend.transport).toHaveBeenCalledTimes(1);
    expect(observer.getSnapshot()).toMatchObject({
      status: 'success',
      data: ['a'],
    });
    expect(onChange).toHaveBeenCalled(); // loading, then success
  });

  test('fresh data → subscribing does not fetch', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });
    const q = { ...todosQuery, staleTime: 60_000 };
    await client.query(q);

    client.observe(q).subscribe(() => {});
    await flush();

    expect(backend.transport).toHaveBeenCalledTimes(1);
  });

  test('two observers of the same query → one request', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });

    client.observe(todosQuery).subscribe(() => {});
    client.observe(todosQuery).subscribe(() => {});
    await flush();

    expect(backend.transport).toHaveBeenCalledTimes(1);
  });

  test('invalidated while subscribed → refetches and shows new data', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });
    const observer = client.observe<string[]>({
      ...todosQuery,
      staleTime: 60_000,
    });
    observer.subscribe(() => {});
    await flush();

    backend.setTodos(['a', 'b']);
    client.invalidateTags(['todos']);
    await flush();

    expect(backend.transport).toHaveBeenCalledTimes(2);
    expect(observer.getSnapshot()?.data).toEqual(['a', 'b']);
  });

  test('invalidated with no subscriber → only marked, no fetch', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });
    const observer = client.observe(todosQuery);
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    unsubscribe();

    client.invalidateTags(['todos']);
    await flush();

    expect(backend.transport).toHaveBeenCalledTimes(1);
    expect(observer.getSnapshot()).toMatchObject({ invalidated: true });
  });

  test('invalidated, then the server fails → no infinite refetch loop', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });
    const observer = client.observe(todosQuery);
    observer.subscribe(() => {});
    await flush();

    backend.failWith(500);
    client.invalidateTags(['todos']);
    for (let i = 0; i < 5; i++) await flush(); // give a loop every chance to happen

    expect(backend.transport).toHaveBeenCalledTimes(2);
    expect(observer.getSnapshot()).toMatchObject({
      status: 'error',
      invalidated: false,
      data: ['a'], // previous data is kept
    });
  });

  test('getSnapshot returns the same reference while nothing changes', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });
    const observer = client.observe(todosQuery);
    observer.subscribe(() => {});
    await flush();

    expect(observer.getSnapshot()).toBe(observer.getSnapshot());
  });

  test('last subscriber leaves → the in-flight request is aborted', async () => {
    const pending = deferred<TransportResponse>();
    let requestSignal: AbortSignal | undefined;
    const transport = jest.fn<Transport>((req) => {
      requestSignal = req.signal;
      return pending.promise;
    });
    const client = createClient({ transport });
    const observer = client.observe(todosQuery);

    const unsubscribe = observer.subscribe(() => {});
    await flush();
    expect(requestSignal?.aborted).toBe(false);

    unsubscribe();
    expect(requestSignal?.aborted).toBe(true);
  });

  test('refetch() always fetches, even when data is fresh', async () => {
    const backend = createBackend();
    const client = createClient({ transport: backend.transport });
    const observer = client.observe<string[]>({
      ...todosQuery,
      staleTime: 60_000,
    });
    observer.subscribe(() => {});
    await flush();

    backend.setTodos(['a', 'c']);
    await expect(observer.refetch()).resolves.toEqual(['a', 'c']);
    expect(backend.transport).toHaveBeenCalledTimes(2);
  });

  test('a non-serializable body cannot be observed', () => {
    const client = createClient({ transport: createBackend().transport });

    expect(() =>
      client.observe({ method: 'POST', url: '/upload', body: new FormData() })
    ).toThrow(TypeError);
  });
});
