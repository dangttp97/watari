import { expect, jest, test } from '@jest/globals';

import { deferred } from '../../__fixtures__/deferred';
import { AbortedError } from '../../errors/AbortedError';
import { createInflight } from '../inflight';

test('two joins on the same key start the request once', async () => {
  const inflight = createInflight();
  const start = jest.fn(async () => 'data');

  const [a, b] = await Promise.all([
    inflight.join('k', start),
    inflight.join('k', start),
  ]);

  expect(start).toHaveBeenCalledTimes(1);
  expect([a, b]).toEqual(['data', 'data']);
});

test('different keys start separate requests', async () => {
  const inflight = createInflight();
  const start = jest.fn(async () => 'data');

  await Promise.all([inflight.join('a', start), inflight.join('b', start)]);

  expect(start).toHaveBeenCalledTimes(2);
});

test('forget → the next join starts a new request; the old one finishing does not remove the new one', async () => {
  const inflight = createInflight();
  const first = deferred<string>();
  const second = deferred<string>();
  const start = jest
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);

  const p1 = inflight.join('k', start);
  inflight.forget('k');
  const p2 = inflight.join('k', start);

  first.resolve('old');
  await expect(p1).resolves.toBe('old');

  // the new flight must still be shared after the old one settled
  const p3 = inflight.join('k', start);
  second.resolve('new');
  await expect(Promise.all([p2, p3])).resolves.toEqual(['new', 'new']);
  expect(start).toHaveBeenCalledTimes(2);
});

test('A aborts, B keeps waiting: A gets AbortedError, B gets data, the request is not aborted', async () => {
  const inflight = createInflight();
  const d = deferred<string>();
  let shared!: AbortSignal;
  const start = (signal: AbortSignal) => {
    shared = signal;
    return d.promise;
  };
  const a = new AbortController();

  const pa = inflight.join('k', start, a.signal);
  const pb = inflight.join('k', start);
  a.abort();
  d.resolve('data');

  await expect(pa).rejects.toBeInstanceOf(AbortedError);
  await expect(pb).resolves.toBe('data');
  expect(shared.aborted).toBe(false);
});

test('everyone aborts → the underlying request is aborted', async () => {
  const inflight = createInflight();
  let shared!: AbortSignal;
  const start = (signal: AbortSignal) => {
    shared = signal;
    return deferred<string>().promise;
  };
  const a = new AbortController();
  const b = new AbortController();

  const pa = inflight.join('k', start, a.signal);
  const pb = inflight.join('k', start, b.signal);
  a.abort();
  expect(shared.aborted).toBe(false);
  b.abort();

  await expect(pa).rejects.toBeInstanceOf(AbortedError);
  await expect(pb).rejects.toBeInstanceOf(AbortedError);
  expect(shared.aborted).toBe(true);
});

test('everyone aborts, then an immediate join starts a fresh request', async () => {
  const inflight = createInflight();
  const start = jest.fn((_signal: AbortSignal) => deferred<string>().promise);
  const a = new AbortController();

  const pa = inflight.join('k', start, a.signal);
  a.abort();
  await expect(pa).rejects.toBeInstanceOf(AbortedError);

  inflight.join('k', start);
  expect(start).toHaveBeenCalledTimes(2);
});

test('a request rejected after everyone left does not cause an unhandled rejection', async () => {
  const inflight = createInflight();
  const d = deferred<string>();
  const a = new AbortController();
  const unhandled = jest.fn();
  process.on('unhandledRejection', unhandled);

  const pa = inflight.join('k', () => d.promise, a.signal);
  a.abort();
  await expect(pa).rejects.toBeInstanceOf(AbortedError);
  d.reject(new Error('aborted underneath'));
  await new Promise((r) => setTimeout(r, 0));

  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
});

test('an already-aborted signal rejects immediately', async () => {
  const inflight = createInflight();
  const a = new AbortController();
  a.abort();

  await expect(
    inflight.join('k', async () => 'data', a.signal)
  ).rejects.toBeInstanceOf(AbortedError);
});
