import type { CacheKey } from '../cache/types';
import { AbortedError } from '../errors/AbortedError';

type Flight = {
  promise: Promise<unknown>;
  controller: AbortController;
  waiters: number;
  settled: boolean;
};

export const createInflight = () => {
  const flights = new Map<CacheKey, Flight>();

  const waitFor = <T>(
    key: CacheKey,
    flight: Flight,
    signal?: AbortSignal
  ): Promise<T> => {
    flight.waiters++;
    const leave = () => {
      flight.waiters--;
      if (flight.waiters === 0 && !flight.settled) {
        if (flights.get(key) === flight) flights.delete(key);
        flight.controller.abort();
      }
    };

    if (!signal) return (flight.promise as Promise<T>).finally(leave);

    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        leave();
        reject(new AbortedError());
        return;
      }
      const onAbort = () => {
        leave();
        reject(new AbortedError()); // only this caller stops waiting
      };
      signal.addEventListener('abort', onAbort, { once: true });
      (flight.promise as Promise<T>).then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort);
        if (!signal.aborted) leave();
      });
    });
  };

  const join = <T>(
    key: CacheKey,
    start: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> => {
    let flight = flights.get(key);
    if (!flight) {
      const controller = new AbortController();
      const created: Flight = {
        controller,
        waiters: 0,
        settled: false,
        promise: Promise.resolve(),
      };
      created.promise = start(controller.signal).finally(() => {
        created.settled = true;
        if (flights.get(key) === created) flights.delete(key);
      });
      created.promise.catch(() => {});
      flights.set(key, created);
      flight = created;
    }
    return waitFor<T>(key, flight, signal);
  };

  const forget = (key: CacheKey) => {
    flights.delete(key);
  };

  const clear = () => flights.clear();

  return { join, forget, clear };
};

export type Inflight = ReturnType<typeof createInflight>;
